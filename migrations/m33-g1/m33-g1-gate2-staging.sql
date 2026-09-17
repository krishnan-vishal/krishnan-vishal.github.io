-- M33-G1 Step 6A forward migration package.
-- VERSION-CONTROLLED BUILD ARTIFACT ONLY. DO NOT APPLY WITHOUT OWNER APPROVAL.
-- Requires a read-only drift/preflight review immediately before application.

BEGIN;

DO $m33_preflight$
DECLARE
    required_relation text;
BEGIN
    FOREACH required_relation IN ARRAY ARRAY[
        'public.source_registry',
        'public.intelligence_ingestion_runs',
        'public.intelligence_raw_ingestion',
        'public.intelligence_candidates',
        'public.intelligence_rejection_log',
        'public.global_announcements'
    ]
    LOOP
        IF pg_catalog.to_regclass(required_relation) IS NULL THEN
            RAISE EXCEPTION 'M33-G1 preflight: required relation % is missing', required_relation;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.intelligence_raw_ingestion raw
        LEFT JOIN public.source_registry source
          ON source.source_id = raw.source_id
        WHERE source.source_id IS NULL
    ) THEN
        RAISE EXCEPTION 'M33-G1 preflight: RAW source lineage contains unresolved source_id values';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.intelligence_ingestion_runs run
        LEFT JOIN public.source_registry source
          ON source.source_id = run.source_id
        WHERE run.source_id IS NOT NULL
          AND source.source_id IS NULL
    ) THEN
        RAISE EXCEPTION 'M33-G1 preflight: run lineage contains unresolved source_id values';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.intelligence_candidates candidate
        LEFT JOIN public.intelligence_raw_ingestion raw
          ON raw.id = candidate.raw_ingestion_id
        WHERE candidate.raw_ingestion_id IS NOT NULL
          AND raw.id IS NULL
    ) OR EXISTS (
        SELECT 1
        FROM public.intelligence_rejection_log rejection
        LEFT JOIN public.intelligence_raw_ingestion raw
          ON raw.id = rejection.raw_ingestion_id
        WHERE rejection.raw_ingestion_id IS NOT NULL
          AND raw.id IS NULL
    ) THEN
        RAISE EXCEPTION 'M33-G1 preflight: downstream RAW lineage contains orphaned IDs';
    END IF;
END
$m33_preflight$;

ALTER TABLE public.intelligence_raw_ingestion
    ADD COLUMN IF NOT EXISTS ingestion_run_id uuid;

ALTER TABLE public.intelligence_candidates
    ADD COLUMN IF NOT EXISTS assessment_id uuid,
    ADD COLUMN IF NOT EXISTS assessment_version text,
    ADD COLUMN IF NOT EXISTS assessment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS taxonomy_version text,
    ADD COLUMN IF NOT EXISTS secondary_categories text[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS use_case text,
    ADD COLUMN IF NOT EXISTS payment_rail text,
    ADD COLUMN IF NOT EXISTS validation_version text;

ALTER TABLE public.intelligence_rejection_log
    ADD COLUMN IF NOT EXISTS assessment_id uuid,
    ADD COLUMN IF NOT EXISTS assessment_version text,
    ADD COLUMN IF NOT EXISTS assessment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS rejection_stage text;

DO $m33_constraints$
DECLARE
    existing_constraint record;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_raw_ingestion_run'
          AND conrelid = 'public.intelligence_raw_ingestion'::regclass
    ) THEN
        ALTER TABLE public.intelligence_raw_ingestion
            ADD CONSTRAINT fk_m33_raw_ingestion_run
            FOREIGN KEY (ingestion_run_id)
            REFERENCES public.intelligence_ingestion_runs(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_raw_source'
          AND conrelid = 'public.intelligence_raw_ingestion'::regclass
    ) THEN
        ALTER TABLE public.intelligence_raw_ingestion
            ADD CONSTRAINT fk_m33_raw_source
            FOREIGN KEY (source_id)
            REFERENCES public.source_registry(source_id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_run_source'
          AND conrelid = 'public.intelligence_ingestion_runs'::regclass
    ) THEN
        ALTER TABLE public.intelligence_ingestion_runs
            ADD CONSTRAINT fk_m33_run_source
            FOREIGN KEY (source_id)
            REFERENCES public.source_registry(source_id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_candidate_raw_preserve'
          AND conrelid = 'public.intelligence_candidates'::regclass
          AND confdeltype = 'r'
    ) THEN
        FOR existing_constraint IN
            SELECT constraint_row.conname
            FROM pg_catalog.pg_constraint constraint_row
            JOIN pg_catalog.pg_attribute attribute_row
              ON attribute_row.attrelid = constraint_row.conrelid
             AND attribute_row.attnum = ANY (constraint_row.conkey)
            WHERE constraint_row.conrelid = 'public.intelligence_candidates'::regclass
              AND constraint_row.confrelid = 'public.intelligence_raw_ingestion'::regclass
              AND constraint_row.contype = 'f'
              AND attribute_row.attname = 'raw_ingestion_id'
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.intelligence_candidates DROP CONSTRAINT %I',
                existing_constraint.conname
            );
        END LOOP;

        ALTER TABLE public.intelligence_candidates
            ADD CONSTRAINT fk_m33_candidate_raw_preserve
            FOREIGN KEY (raw_ingestion_id)
            REFERENCES public.intelligence_raw_ingestion(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_rejection_raw_preserve'
          AND conrelid = 'public.intelligence_rejection_log'::regclass
          AND confdeltype = 'r'
    ) THEN
        FOR existing_constraint IN
            SELECT constraint_row.conname
            FROM pg_catalog.pg_constraint constraint_row
            JOIN pg_catalog.pg_attribute attribute_row
              ON attribute_row.attrelid = constraint_row.conrelid
             AND attribute_row.attnum = ANY (constraint_row.conkey)
            WHERE constraint_row.conrelid = 'public.intelligence_rejection_log'::regclass
              AND constraint_row.confrelid = 'public.intelligence_raw_ingestion'::regclass
              AND constraint_row.contype = 'f'
              AND attribute_row.attname = 'raw_ingestion_id'
        LOOP
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.intelligence_rejection_log DROP CONSTRAINT %I',
                existing_constraint.conname
            );
        END LOOP;

        ALTER TABLE public.intelligence_rejection_log
            ADD CONSTRAINT fk_m33_rejection_raw_preserve
            FOREIGN KEY (raw_ingestion_id)
            REFERENCES public.intelligence_raw_ingestion(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'ck_m33_rejection_stage'
          AND conrelid = 'public.intelligence_rejection_log'::regclass
    ) THEN
        ALTER TABLE public.intelligence_rejection_log
            ADD CONSTRAINT ck_m33_rejection_stage
            CHECK (rejection_stage IS NULL OR rejection_stage IN ('GATE1', 'GATE2'))
            NOT VALID;
    END IF;
END
$m33_constraints$;

ALTER TABLE public.intelligence_raw_ingestion
    VALIDATE CONSTRAINT fk_m33_raw_ingestion_run;
ALTER TABLE public.intelligence_raw_ingestion
    VALIDATE CONSTRAINT fk_m33_raw_source;
ALTER TABLE public.intelligence_ingestion_runs
    VALIDATE CONSTRAINT fk_m33_run_source;
ALTER TABLE public.intelligence_candidates
    VALIDATE CONSTRAINT fk_m33_candidate_raw_preserve;
ALTER TABLE public.intelligence_rejection_log
    VALIDATE CONSTRAINT fk_m33_rejection_raw_preserve;
ALTER TABLE public.intelligence_rejection_log
    VALIDATE CONSTRAINT ck_m33_rejection_stage;

CREATE INDEX IF NOT EXISTS idx_m33_raw_ingestion_run
    ON public.intelligence_raw_ingestion (ingestion_run_id);
CREATE INDEX IF NOT EXISTS idx_m33_candidate_assessment
    ON public.intelligence_candidates (assessment_id);
CREATE INDEX IF NOT EXISTS idx_m33_rejection_assessment
    ON public.intelligence_rejection_log (assessment_id);

CREATE TABLE IF NOT EXISTS public.intelligence_canonical_handoffs (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    candidate_id uuid NOT NULL,
    handoff_key text NOT NULL,
    validation_version text NOT NULL,
    payload jsonb NOT NULL,
    handoff_status text NOT NULL DEFAULT 'PENDING',
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    accepted_at timestamptz,
    failed_at timestamptz,
    failure_code text,
    supersedes_handoff_id uuid
);

DO $m33_handoff_constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_handoff_candidate'
          AND conrelid = 'public.intelligence_canonical_handoffs'::regclass
    ) THEN
        ALTER TABLE public.intelligence_canonical_handoffs
            ADD CONSTRAINT fk_m33_handoff_candidate
            FOREIGN KEY (candidate_id)
            REFERENCES public.intelligence_candidates(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'fk_m33_handoff_supersedes'
          AND conrelid = 'public.intelligence_canonical_handoffs'::regclass
    ) THEN
        ALTER TABLE public.intelligence_canonical_handoffs
            ADD CONSTRAINT fk_m33_handoff_supersedes
            FOREIGN KEY (supersedes_handoff_id)
            REFERENCES public.intelligence_canonical_handoffs(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'ck_m33_handoff_status'
          AND conrelid = 'public.intelligence_canonical_handoffs'::regclass
    ) THEN
        ALTER TABLE public.intelligence_canonical_handoffs
            ADD CONSTRAINT ck_m33_handoff_status
            CHECK (handoff_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'FAILED'))
            NOT VALID;
    END IF;
END
$m33_handoff_constraints$;

ALTER TABLE public.intelligence_canonical_handoffs
    VALIDATE CONSTRAINT fk_m33_handoff_candidate;
ALTER TABLE public.intelligence_canonical_handoffs
    VALIDATE CONSTRAINT fk_m33_handoff_supersedes;
ALTER TABLE public.intelligence_canonical_handoffs
    VALIDATE CONSTRAINT ck_m33_handoff_status;

CREATE UNIQUE INDEX IF NOT EXISTS uq_m33_handoff_key
    ON public.intelligence_canonical_handoffs (handoff_key);
CREATE INDEX IF NOT EXISTS idx_m33_handoff_candidate
    ON public.intelligence_canonical_handoffs (candidate_id);
CREATE INDEX IF NOT EXISTS idx_m33_handoff_status_created
    ON public.intelligence_canonical_handoffs (handoff_status, created_at);

ALTER TABLE public.intelligence_canonical_handoffs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gpir_prevent_raw_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RAISE EXCEPTION 'M33-G1 RAW evidence is append-oriented and cannot be deleted';
END
$function$;

DROP TRIGGER IF EXISTS trg_m33_prevent_raw_delete
    ON public.intelligence_raw_ingestion;
CREATE TRIGGER trg_m33_prevent_raw_delete
BEFORE DELETE ON public.intelligence_raw_ingestion
FOR EACH ROW
EXECUTE FUNCTION public.gpir_prevent_raw_delete();

CREATE OR REPLACE FUNCTION public.gpir_intelligence_assessment(
    p_title text,
    p_url text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
WITH normalized AS (
    SELECT pg_catalog.lower(
        coalesce(p_title, '') || ' ' || coalesce(p_url, '')
    ) AS body
),
rulebook(family, ordinal, pattern, weight) AS (
    VALUES
        ('PAYMENTS', 1, '\m(payments?|settlement|clearing)\M', 30),
        ('PAYMENTS', 1, '\mpayment systems?\M', 40),
        ('BANKING', 2, '\m(bank|banking)\M', 40),
        ('REGULATION', 3, '\m(regulat|licen[cs]|rule|supervis|compliance)\w*', 50),
        ('FINTECH', 4, '\mfintech\M', 45),
        ('CROSS_BORDER_PAYMENTS', 5, 'cross[- ]border', 55),
        ('REMITTANCES', 6, '\m(remittance|money transfer)\w*', 55),
        ('RTP_A2A', 7, '(real[- ]time|instant) payments?|account[- ]to[- ]account|\ma2a\M|\mrtp\M', 55),
        ('CARDS_SCHEMES', 8, '\m(card|scheme|interchange)\w*', 50),
        ('WALLETS', 9, '\m(wallet|mobile money)\w*', 50),
        ('PSP_MTO_MSB_AGGREGATORS', 10, '\m(psp|mto|msb|aggregator|payment service provider)\w*', 50),
        ('OPEN_BANKING_OPEN_FINANCE', 11, 'open banking|open finance', 55),
        ('STABLECOINS_DIGITAL_ASSETS', 12, '\m(stablecoin|digital asset|crypto|blockchain)\w*', 55),
        ('CBDC', 13, '\m(cbdc|central bank digital currency)\w*', 60),
        ('AML_KYC_KYB_SANCTIONS', 14, '\m(aml|kyc|kyb|sanctions?|anti[- ]money laundering)\M', 55),
        ('FRAUD_CYBER_TPRM', 15, '\m(fraud|cyber|tprm|third[- ]party risk)\w*', 55),
        ('PAYMENT_INFRASTRUCTURE', 16, 'payment infrastructure|payment rail', 60),
        ('PAYMENT_INFRASTRUCTURE', 16, 'payment system (migration|modernization)', 80),
        ('PAYMENT_INFRASTRUCTURE', 16, 'payment switch', 45),
        ('ISO_20022_MESSAGING', 17, 'iso[ -]?20022|financial messaging', 60),
        ('FX_TREASURY_SETTLEMENT', 18, '\m(fx|foreign exchange|treasury|liquidity)\M', 50),
        ('MERCHANT_ACQUIRING', 19, '\m(merchant|acquir|acceptance)\w*', 50),
        ('DIGITAL_IDENTITY', 20, 'digital identity|identity verification', 55),
        ('AI_AGENTIC_PAYMENTS', 21, 'agentic payments?|artificial intelligence|\mai\M', 55),
        ('BNPL', 22, '\m(bnpl|buy now pay later)\M', 60)
),
family_scores AS (
    SELECT rule.family, pg_catalog.min(rule.ordinal) AS ordinal,
           pg_catalog.sum(rule.weight) AS family_score
    FROM normalized input
    JOIN rulebook rule ON input.body ~ rule.pattern
    GROUP BY rule.family
),
ranked AS (
    SELECT family, ordinal, family_score,
           pg_catalog.row_number() OVER (ORDER BY family_score DESC, ordinal) AS family_rank
    FROM family_scores
),
scored AS (
    SELECT least(100, greatest(0,
        CASE
            WHEN input.body ~ '\m(news|release|report|consultation|guidance|notice|launch|announc)\w*' THEN 15
            ELSE 0
        END
        + CASE
            WHEN input.body ~ 'financial sector|innovation|technology|event|briefing|development' THEN 30
            ELSE 0
        END
        + coalesce((SELECT pg_catalog.max(family_score) FROM family_scores), 0)
        + least(20, greatest(0,
            coalesce((SELECT pg_catalog.sum(family_score) FROM family_scores), 0)
            - coalesce((SELECT pg_catalog.max(family_score) FROM family_scores), 0)
        ))
    ))::integer AS score,
    input.body
    FROM normalized input
)
SELECT pg_catalog.jsonb_build_object(
    'decision', CASE
        WHEN scored.score >= 60 THEN 'CANDIDATE'
        WHEN scored.score >= 30 THEN 'REVIEW'
        ELSE 'REJECT'
    END,
    'score', scored.score,
    'category', coalesce(
        (SELECT family FROM ranked WHERE family_rank = 1),
        'UNKNOWN'
    ),
    'primary_category', coalesce(
        (SELECT family FROM ranked WHERE family_rank = 1),
        'UNKNOWN'
    ),
    'secondary_categories', coalesce(
        (SELECT pg_catalog.jsonb_agg(family ORDER BY family_score DESC, ordinal)
         FROM ranked WHERE family_rank > 1),
        '[]'::jsonb
    ),
    'taxonomy_version', 'M33-G1-TAXONOMY-1',
    'event_type', CASE
        WHEN scored.body ~ '\mconsultation\w*' THEN 'CONSULTATION'
        WHEN scored.body ~ '\m(regulat|licen[cs]|rule|supervis)\w*' THEN 'REGULATORY_CHANGE'
        WHEN scored.body ~ '\mreport\w*' THEN 'REPORT'
        WHEN scored.body ~ '\m(launch|rollout)\w*' THEN 'LAUNCH'
        WHEN scored.body ~ '\m(event|summit|conference)\w*' THEN 'EVENT'
        ELSE 'NEWS'
    END,
    'use_case', CASE
        WHEN scored.body ~ '\mremittance\w*' THEN 'REMITTANCE'
        WHEN scored.body ~ 'cross[- ]border' THEN 'CROSS_BORDER'
        WHEN scored.body ~ '\mmerchant\w*' THEN 'MERCHANT_PAYMENTS'
        WHEN scored.body ~ '\m(aml|kyc|kyb|sanctions?)\M' THEN 'COMPLIANCE'
        ELSE 'UNKNOWN'
    END,
    'payment_rail', CASE
        WHEN scored.body ~ '\m(card|scheme|interchange)\w*' THEN 'CARDS'
        WHEN scored.body ~ '(real[- ]time|instant) payments?|account[- ]to[- ]account|\ma2a\M|\mrtp\M' THEN 'RTP_A2A'
        WHEN scored.body ~ '\m(wallet|mobile money)\w*' THEN 'WALLET'
        WHEN scored.body ~ 'iso[ -]?20022' THEN 'ISO_20022'
        ELSE 'UNKNOWN'
    END
)
FROM scored;
$function$;

CREATE OR REPLACE FUNCTION public.gpir_process_raw_record(p_raw_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
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
        coalesce(raw_record.canonical_url, raw_record.discovered_url, '')
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
$function$;

CREATE OR REPLACE FUNCTION public.gpir_process_raw_batch(p_limit integer)
RETURNS TABLE(raw_id uuid, processing_result text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    selected_raw record;
    effective_limit integer := least(1000, greatest(1, coalesce(p_limit, 1)));
BEGIN
    FOR selected_raw IN
        SELECT raw.id
          FROM public.intelligence_raw_ingestion raw
         WHERE raw.ingestion_status = 'RAW'
         ORDER BY raw.discovered_at ASC, raw.id ASC
         LIMIT effective_limit
    LOOP
        raw_id := selected_raw.id;
        processing_result := public.gpir_process_raw_record(selected_raw.id);
        RETURN NEXT;
    END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.gpir_create_canonical_handoff(p_candidate_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    candidate_record public.intelligence_candidates%ROWTYPE;
    raw_record public.intelligence_raw_ingestion%ROWTYPE;
    handoff_identifier uuid;
    deterministic_key text;
BEGIN
    SELECT candidate.*
      INTO candidate_record
      FROM public.intelligence_candidates candidate
     WHERE candidate.id = p_candidate_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'NOT_FOUND';
    END IF;

    IF candidate_record.candidate_status <> 'APPROVED'
       OR candidate_record.validated_at IS NULL
       OR candidate_record.validation_version IS NULL THEN
        RETURN 'NOT_VALIDATED';
    END IF;

    IF candidate_record.ticker_eligible IS DISTINCT FROM false THEN
        RETURN 'INVALID_STAGING_ELIGIBILITY';
    END IF;

    SELECT raw.*
      INTO raw_record
      FROM public.intelligence_raw_ingestion raw
     WHERE raw.id = candidate_record.raw_ingestion_id;

    IF NOT FOUND OR raw_record.source_id IS NULL OR raw_record.ingestion_run_id IS NULL
       OR candidate_record.assessment_id IS NULL THEN
        RETURN 'LINEAGE_INCOMPLETE';
    END IF;

    deterministic_key := pg_catalog.md5(
        candidate_record.id::text || '|' ||
        candidate_record.validation_version || '|' ||
        coalesce(candidate_record.content_fingerprint, 'NO_FINGERPRINT') || '|' ||
        candidate_record.validated_at::text
    );

    INSERT INTO public.intelligence_canonical_handoffs (
        candidate_id, handoff_key, validation_version, payload, handoff_status
    ) VALUES (
        candidate_record.id,
        deterministic_key,
        candidate_record.validation_version,
        pg_catalog.jsonb_build_object(
            'candidate_id', candidate_record.id,
            'raw_ingestion_id', raw_record.id,
            'source_id', raw_record.source_id,
            'ingestion_run_id', raw_record.ingestion_run_id,
            'assessment_id', candidate_record.assessment_id,
            'assessment_version', candidate_record.assessment_version,
            'validation_version', candidate_record.validation_version,
            'validated_at', candidate_record.validated_at,
            'canonical_url', candidate_record.canonical_url,
            'title', candidate_record.title,
            'summary_narration', candidate_record.summary_narration,
            'published_at', candidate_record.published_at,
            'source_tier', candidate_record.source_tier,
            'confidence_score', candidate_record.confidence_score,
            'primary_category', candidate_record.category,
            'secondary_categories', candidate_record.secondary_categories,
            'taxonomy_version', candidate_record.taxonomy_version,
            'event_type', candidate_record.event_type,
            'use_case', candidate_record.use_case,
            'payment_rail', candidate_record.payment_rail,
            'content_fingerprint', candidate_record.content_fingerprint,
            'freshness_status', candidate_record.freshness_status,
            'validation_notes', candidate_record.validation_notes
        ),
        'PENDING'
    )
    ON CONFLICT (handoff_key) DO NOTHING
    RETURNING id INTO handoff_identifier;

    IF handoff_identifier IS NULL THEN
        RETURN 'HANDOFF_EXISTS';
    END IF;

    RETURN 'HANDOFF_CREATED';
END
$function$;

-- The only approved publication-table operation in this package changes the
-- default for future inserts. It does not rewrite any existing row.
ALTER TABLE public.global_announcements
    ALTER COLUMN ticker_eligible SET DEFAULT false;

-- Role names and existing grants were not verified in Step 5D/5E. Remove the
-- unsafe generic callable surface now; a later controlled application must
-- grant EXECUTE only to an owner-verified least-privilege processing role.
REVOKE ALL ON FUNCTION public.gpir_process_raw_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_process_raw_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_create_canonical_handoff(uuid) FROM PUBLIC;
REVOKE DELETE ON TABLE public.intelligence_raw_ingestion FROM PUBLIC;

COMMENT ON TABLE public.intelligence_canonical_handoffs IS
    'M33-G1 validated-candidate handoff staging; not publication';
COMMENT ON FUNCTION public.gpir_process_raw_record(uuid) IS
    'M33-G1 Gate 1 + Gate 2 staging processor; no publication capability';
COMMENT ON FUNCTION public.gpir_process_raw_batch(integer) IS
    'M33-G1 bounded 1..1000 RAW staging processor; no publication capability';
COMMENT ON FUNCTION public.gpir_create_canonical_handoff(uuid) IS
    'M33-G1 idempotent validated-candidate handoff creator; no publication capability';

COMMIT;
