CREATE OR REPLACE FUNCTION public.gpir_intelligence_assessment(p_title text, p_url text, p_summary text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $g1$
WITH original AS (
 SELECT public.gpir_intelligence_assessment(p_title,p_url) AS assessment
), signals AS (
 SELECT assessment, lower(coalesce(p_title,'')) AS headline,
 lower(left(coalesce(p_summary,''),2000)) AS evidence FROM original
), scoring AS (
 SELECT assessment,
 CASE
 WHEN length(btrim(evidence)) < 70 THEN 0
 WHEN headline ~ '(payment|settlement|clearing|remittance|money transfer|fednow|sepa|upi|pix|merchant acquir|payment rail|payment network)'
 AND evidence ~ '(payment|settlement|clearing|remittance|money transfer|fednow|sepa|upi|pix|merchant acquir|payment rail|payment network)'
 AND evidence ~ '(launch|regulat|approv|deploy|integrat|rollout|licen|operat|transact|adopt|expand|partner|compliance|fraud|security)'
 THEN 20
 WHEN headline ~ '(payment|settlement|clearing|remittance|money transfer|fednow|sepa|upi|pix|merchant acquir|payment rail|payment network)'
 AND evidence ~ '(payment|settlement|clearing|remittance|money transfer|fednow|sepa|upi|pix|merchant acquir|payment rail|payment network)'
 THEN 10
 ELSE 0 END AS evidence_bonus FROM signals
), final AS (
 SELECT assessment,evidence_bonus,least(100,((assessment->>'score')::int + evidence_bonus)) AS final_score FROM scoring
)
SELECT (assessment || jsonb_build_object(
 'score',final_score,
 'decision',CASE WHEN final_score>=60 THEN 'CANDIDATE' WHEN final_score>=30 THEN 'REVIEW' ELSE 'REJECT' END,
 'assessment_method','TITLE_URL_PLUS_BOUNDED_SUMMARY_CONTEXT',
 'summary_evidence_bonus',evidence_bonus
)) FROM final
$g1$;
CREATE OR REPLACE FUNCTION public.gpir_process_raw_record(p_raw_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    raw_record public.intelligence_raw_ingestion%ROWTYPE;
    gate1_reason text;
    assessment jsonb;
    decision text;
    score numeric;
    primary_category text;
    assessment_identifier uuid := pg_catalog.gen_random_uuid();
    existing_candidate_id uuid;
    secondary_categories text[];
    freshness text;
BEGIN
    SELECT raw.*
      INTO raw_record
      FROM public.intelligence_raw_ingestion raw
     WHERE raw.id = p_raw_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'NOT_FOUND';
    END IF;

    IF raw_record.ingestion_status <> 'RAW' THEN
        RETURN 'ALREADY_PROCESSED';
    END IF;

    gate1_reason := public.gpir_rejection_reason(
        raw_record.raw_title,
        coalesce(raw_record.canonical_url, raw_record.discovered_url, '')
    );

    IF gate1_reason IS NOT NULL THEN
        INSERT INTO public.intelligence_rejection_log (
            raw_ingestion_id, source_id, canonical_url, raw_title,
            rejection_code, rejection_reason, rejection_stage,
            assessment_id, assessment_version, assessment_payload
        ) VALUES (
            raw_record.id, raw_record.source_id, raw_record.canonical_url,
            raw_record.raw_title, 'GATE1:' || gate1_reason,
            'Deterministic Gate 1 rejection', 'GATE1', assessment_identifier,
            'M33-G1-GATE1-1',
            pg_catalog.jsonb_build_object('gate', 'GATE1', 'reason', gate1_reason)
        );

        UPDATE public.intelligence_raw_ingestion
           SET ingestion_status = 'REJECTED',
               rejection_reason = 'GATE1:' || gate1_reason
         WHERE id = raw_record.id;

        RETURN 'REJECT:GATE1:' || gate1_reason;
    END IF;

    assessment := public.gpir_intelligence_assessment(
        raw_record.raw_title,
        coalesce(raw_record.canonical_url, raw_record.discovered_url, ''),
        raw_record.raw_content
    );

    IF pg_catalog.jsonb_typeof(assessment) <> 'object'
       OR pg_catalog.jsonb_typeof(assessment -> 'decision') <> 'string'
       OR pg_catalog.jsonb_typeof(assessment -> 'score') <> 'number'
       OR pg_catalog.jsonb_typeof(assessment -> 'category') <> 'string'
       OR pg_catalog.jsonb_typeof(assessment -> 'event_type') <> 'string'
       OR assessment ->> 'decision' NOT IN ('REJECT', 'REVIEW', 'CANDIDATE') THEN
        UPDATE public.intelligence_raw_ingestion
           SET ingestion_status = 'ERROR',
               rejection_reason = 'ASSESSMENT_ERROR'
         WHERE id = raw_record.id;
        RETURN 'ASSESSMENT_ERROR';
    END IF;

    decision := assessment ->> 'decision';
    score := (assessment ->> 'score')::numeric;
    primary_category := coalesce(assessment ->> 'primary_category', assessment ->> 'category', 'UNKNOWN');
    secondary_categories := ARRAY(
        SELECT pg_catalog.jsonb_array_elements_text(
            coalesce(assessment -> 'secondary_categories', '[]'::jsonb)
        )
    );

    IF decision = 'REJECT' THEN
        INSERT INTO public.intelligence_rejection_log (
            raw_ingestion_id, source_id, canonical_url, raw_title,
            rejection_code, rejection_reason, rejection_stage,
            assessment_id, assessment_version, assessment_payload
        ) VALUES (
            raw_record.id, raw_record.source_id, raw_record.canonical_url,
            raw_record.raw_title, 'GATE2:LOW_INTELLIGENCE_SCORE',
            'Deterministic Gate 2 score below candidate/review threshold',
            'GATE2', assessment_identifier, 'M33-G1-GATE2-1', assessment
        );

        UPDATE public.intelligence_raw_ingestion
           SET ingestion_status = 'REJECTED',
               rejection_reason = 'GATE2:LOW_INTELLIGENCE_SCORE'
         WHERE id = raw_record.id;

        RETURN 'REJECT:GATE2:LOW_INTELLIGENCE_SCORE';
    END IF;

    SELECT candidate.id
      INTO existing_candidate_id
      FROM public.intelligence_candidates candidate
     WHERE (
            raw_record.canonical_url IS NOT NULL
        AND candidate.source_id = raw_record.source_id
        AND candidate.canonical_url = raw_record.canonical_url
     ) OR (
            raw_record.content_hash IS NOT NULL
        AND candidate.content_fingerprint = raw_record.content_hash
     )
     ORDER BY candidate.created_at
     LIMIT 1;

    IF existing_candidate_id IS NOT NULL THEN
        INSERT INTO public.intelligence_rejection_log (
            raw_ingestion_id, source_id, canonical_url, raw_title,
            rejection_code, rejection_reason, rejection_stage,
            assessment_id, assessment_version, assessment_payload
        ) VALUES (
            raw_record.id, raw_record.source_id, raw_record.canonical_url,
            raw_record.raw_title, 'GATE2:DUPLICATE_CANDIDATE',
            'Duplicate of candidate ' || existing_candidate_id::text,
            'GATE2', assessment_identifier, 'M33-G1-GATE2-1', assessment
        );

        UPDATE public.intelligence_raw_ingestion
           SET ingestion_status = 'REJECTED',
               rejection_reason = 'GATE2:DUPLICATE_CANDIDATE'
         WHERE id = raw_record.id;

        RETURN 'DUPLICATE';
    END IF;

    freshness := CASE
        WHEN raw_record.source_published_at IS NULL THEN 'UNKNOWN'
        WHEN raw_record.source_published_at > pg_catalog.now() THEN 'FUTURE'
        WHEN raw_record.source_published_at <= pg_catalog.now() - interval '24 hours' THEN 'HISTORICAL'
        ELSE 'RECENT'
    END;

    INSERT INTO public.intelligence_candidates (
        raw_ingestion_id, source_id, canonical_url, title, published_at,
        category, event_type, confidence_score, candidate_status,
        ticker_eligible, validation_notes, content_fingerprint,
        freshness_status, assessment_id, assessment_version,
        assessment_payload, taxonomy_version, secondary_categories,
        use_case, payment_rail
    ) VALUES (
        raw_record.id, raw_record.source_id, raw_record.canonical_url,
        raw_record.raw_title, raw_record.source_published_at,
        primary_category, assessment ->> 'event_type', score,
        CASE WHEN decision = 'REVIEW' THEN 'REVIEW' ELSE 'PENDING' END,
        false,
        CASE
            WHEN decision = 'REVIEW' THEN 'Gate 2 REVIEW; quarantined for explicit resolution'
            ELSE 'Gate 2 CANDIDATE; deterministic validation required'
        END,
        raw_record.content_hash, freshness, assessment_identifier,
        'M33-G1-GATE2-1', assessment,
        coalesce(assessment ->> 'taxonomy_version', 'M33-G1-TAXONOMY-1'),
        secondary_categories,
        coalesce(assessment ->> 'use_case', 'UNKNOWN'),
        coalesce(assessment ->> 'payment_rail', 'UNKNOWN')
    );

    UPDATE public.intelligence_raw_ingestion
       SET ingestion_status = 'PROCESSED',
           rejection_reason = NULL
     WHERE id = raw_record.id;

    RETURN decision;
END
$function$
