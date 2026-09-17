-- M33-G1 Step 6A behavioral regression harness.
-- ISOLATED POSTGRES ONLY. Never run against production or a database that
-- contains uncommitted RAW work. All fixture writes are enclosed in a rollback.
-- Required session opt-in:
--   SET m33_g1.isolated_test = 'on';

\set ON_ERROR_STOP on

BEGIN;

DO $isolation_gate$
BEGIN
    IF pg_catalog.current_setting('m33_g1.isolated_test', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'M33-G1 regression harness requires m33_g1.isolated_test=on';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.intelligence_raw_ingestion
        WHERE ingestion_status = 'RAW'
    ) THEN
        RAISE EXCEPTION 'M33-G1 isolated harness requires zero pre-existing RAW work';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.source_registry
        WHERE source_id = 'm33-isolated-source'
    ) THEN
        RAISE EXCEPTION 'M33-G1 isolated fixture source already exists';
    END IF;
END
$isolation_gate$;

CREATE TEMP TABLE m33_test_results (
    test_id text NOT NULL,
    passed boolean NOT NULL,
    detail text NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.m33_assert(
    p_test_id text,
    p_condition boolean,
    p_detail text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO m33_test_results(test_id, passed, detail)
    VALUES (p_test_id, coalesce(p_condition, false), p_detail);

    IF p_condition IS DISTINCT FROM true THEN
        RAISE EXCEPTION '% failed: %', p_test_id, p_detail;
    END IF;
END
$function$;

CREATE TEMP TABLE m33_test_state (
    source_id text NOT NULL,
    run_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url,
    poll_minutes, parser_profile, source_status
) VALUES (
    'm33-isolated-source', 'M33 Isolated Source', 'T', 'Testland',
    ARRAY['TEST'], 'TEST', 'TEST', 'https://example.test', 'R',
    'https://example.test/feed', 60, 'm33-isolated-test', 'GREEN'
);

WITH inserted_run AS (
    INSERT INTO public.intelligence_ingestion_runs(source_id, run_status, metadata)
    VALUES ('m33-isolated-source', 'RUNNING', '{"isolated_test":true}'::jsonb)
    RETURNING id, source_id
)
INSERT INTO m33_test_state(source_id, run_id)
SELECT source_id, id FROM inserted_run;

CREATE TEMP TABLE m33_processing_cases (
    test_id text PRIMARY KEY,
    title text,
    url text NOT NULL,
    published_at timestamptz,
    content_hash text NOT NULL,
    expected_result text NOT NULL,
    expected_raw_status text NOT NULL,
    expected_candidate_status text,
    expected_category text,
    expected_freshness text
) ON COMMIT DROP;

INSERT INTO m33_processing_cases VALUES
    ('T01', '', 'https://example.test/t01', NULL, 'm33-t01', 'REJECT:GATE1:EMPTY_TITLE', 'REJECTED', NULL, NULL, NULL),
    ('T02', '<h1>Payments update</h1>', 'https://example.test/t02', NULL, 'm33-t02', 'REJECT:GATE1:HTML_IN_TITLE', 'REJECTED', NULL, NULL, NULL),
    ('T03', 'Home', 'https://example.test/t03', NULL, 'm33-t03', 'REJECT:GATE1:NAVIGATION_OR_STRUCTURAL', 'REJECTED', NULL, NULL, NULL),
    ('T04', 'Central bank payments notice', 'not-a-url', NULL, 'm33-t04', 'REJECT:GATE1:INVALID_URL', 'REJECTED', NULL, NULL, NULL),
    ('T05', 'Office cafeteria menu for Friday', 'https://example.test/t05', NULL, 'm33-t05', 'REJECT:GATE2:LOW_INTELLIGENCE_SCORE', 'REJECTED', NULL, NULL, NULL),
    ('T06', 'National instant payments system expands merchant settlement', 'https://example.test/t06', pg_catalog.now(), 'm33-t06', 'CANDIDATE', 'PROCESSED', 'PENDING', 'PAYMENTS', 'RECENT'),
    ('T07', 'Regulator issues payment institution licensing rules', 'https://example.test/t07', pg_catalog.now(), 'm33-t07', 'CANDIDATE', 'PROCESSED', 'PENDING', 'REGULATION', 'RECENT'),
    ('T08', 'Stablecoin settlement framework opens consultation', 'https://example.test/t08', pg_catalog.now(), 'm33-t08', 'CANDIDATE', 'PROCESSED', 'PENDING', 'STABLECOINS_DIGITAL_ASSETS', 'RECENT'),
    ('T09', 'Open banking service adds real-time account-to-account payments', 'https://example.test/t09', pg_catalog.now(), 'm33-t09', 'CANDIDATE', 'PROCESSED', 'PENDING', 'RTP_A2A', 'RECENT'),
    ('T10', 'Payment switch cyber resilience requirements updated', 'https://example.test/t10', pg_catalog.now(), 'm33-t10', 'CANDIDATE', 'PROCESSED', 'PENDING', 'FRAUD_CYBER_TPRM', 'RECENT'),
    ('T11', 'Annual innovation networking event announced', 'https://example.test/t11', NULL, 'm33-t11', 'REVIEW', 'PROCESSED', 'REVIEW', 'UNKNOWN', 'UNKNOWN'),
    ('T12', 'Cross-border payments interoperability summit publishes implementation report', 'https://example.test/t12', pg_catalog.now(), 'm33-t12', 'CANDIDATE', 'PROCESSED', 'PENDING', 'CROSS_BORDER_PAYMENTS', 'RECENT'),
    ('T13', 'Financial services technology briefing', 'https://example.test/t13', NULL, 'm33-t13', 'REVIEW', 'PROCESSED', 'REVIEW', 'UNKNOWN', 'UNKNOWN'),
    ('T14', 'General organization update', 'https://example.test/t14', NULL, 'm33-t14', 'REJECT:GATE2:LOW_INTELLIGENCE_SCORE', 'REJECTED', NULL, NULL, NULL),
    ('T15', 'Payment infrastructure modernization and settlement upgrade', 'https://example.test/t15', pg_catalog.now(), 'm33-t15', 'CANDIDATE', 'PROCESSED', 'PENDING', 'PAYMENT_INFRASTRUCTURE', 'RECENT'),
    ('T18', 'Payments regulation update', 'https://example.test/t18', NULL, 'm33-t18', 'CANDIDATE', 'PROCESSED', 'PENDING', 'REGULATION', 'UNKNOWN'),
    ('T19', 'New payment rule becomes effective next quarter', 'https://example.test/t19', pg_catalog.now() + interval '30 days', 'm33-t19', 'CANDIDATE', 'PROCESSED', 'PENDING', 'REGULATION', 'FUTURE'),
    ('T20', 'Historical payment system migration completed', 'https://example.test/t20', pg_catalog.now() - interval '30 days', 'm33-t20', 'CANDIDATE', 'PROCESSED', 'PENDING', 'PAYMENT_INFRASTRUCTURE', 'HISTORICAL'),
    ('T21', 'Financial sector development notice', 'https://example.test/t21', NULL, 'm33-t21', 'REVIEW', 'PROCESSED', 'REVIEW', 'UNKNOWN', 'UNKNOWN'),
    ('T22', 'Open-finance fraud controls for instant merchant payments', 'https://example.test/t22', pg_catalog.now(), 'm33-t22', 'CANDIDATE', 'PROCESSED', 'PENDING', 'OPEN_BANKING_OPEN_FINANCE', 'RECENT');

DO $processing_cases$
DECLARE
    fixture m33_processing_cases%ROWTYPE;
    raw_id uuid;
    result text;
    raw_status text;
    candidate_status text;
    candidate_category text;
    candidate_freshness text;
    candidate_ticker boolean;
BEGIN
    FOR fixture IN SELECT * FROM m33_processing_cases ORDER BY test_id
    LOOP
        INSERT INTO public.intelligence_raw_ingestion (
            source_id, discovered_url, canonical_url, raw_title, raw_content,
            discovered_at, source_published_at, http_status, content_hash,
            ingestion_status, metadata, ingestion_run_id
        )
        SELECT state.source_id, fixture.url, fixture.url, fixture.title,
               'isolated test evidence ' || fixture.test_id, pg_catalog.now(),
               fixture.published_at, 200, fixture.content_hash, 'RAW',
               pg_catalog.jsonb_build_object('test_id', fixture.test_id), state.run_id
        FROM m33_test_state state
        RETURNING id INTO raw_id;

        result := public.gpir_process_raw_record(raw_id);

        SELECT ingestion_status INTO raw_status
        FROM public.intelligence_raw_ingestion WHERE id = raw_id;

        SELECT candidate.candidate_status, candidate.category,
               candidate.freshness_status, candidate.ticker_eligible
          INTO candidate_status, candidate_category,
               candidate_freshness, candidate_ticker
          FROM public.intelligence_candidates candidate
         WHERE candidate.raw_ingestion_id = raw_id;

        PERFORM pg_temp.m33_assert(
            fixture.test_id,
            result = fixture.expected_result
            AND raw_status = fixture.expected_raw_status
            AND (
                fixture.expected_candidate_status IS NULL
                OR (
                    candidate_status = fixture.expected_candidate_status
                    AND candidate_category = fixture.expected_category
                    AND candidate_freshness = fixture.expected_freshness
                    AND candidate_ticker = false
                )
            ),
            pg_catalog.format(
                'processor mismatch; expected result=%s state=%s category=%s freshness=%s; actual result=%s state=%s category=%s freshness=%s',
                fixture.expected_result,
                fixture.expected_raw_status,
                coalesce(fixture.expected_category, '<none>'),
                coalesce(fixture.expected_freshness, '<none>'),
                coalesce(result, '<NULL>'),
                coalesce(raw_status, '<NULL>'),
                coalesce(candidate_category, '<none>'),
                coalesce(candidate_freshness, '<none>')
            )
        );
    END LOOP;
END
$processing_cases$;

-- T16 duplicate fingerprint preserves the prior candidate and records the new RAW outcome.
DO $t16$
DECLARE
    raw_id uuid;
    result text;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (
        source_id, discovered_url, canonical_url, raw_title, raw_content,
        content_hash, ingestion_status, metadata, ingestion_run_id
    )
    SELECT source_id, 'https://example.test/t16', 'https://example.test/t16',
           'Instant payments launch duplicate', 'duplicate evidence', 'm33-t06',
           'RAW', '{"test_id":"T16"}'::jsonb, run_id
    FROM m33_test_state
    RETURNING id INTO raw_id;

    result := public.gpir_process_raw_record(raw_id);
    PERFORM pg_temp.m33_assert('T16', result = 'DUPLICATE',
        'duplicate fingerprint must not create another candidate');
END
$t16$;

-- T17 duplicate canonical URL is idempotently rejected from staging.
DO $t17$
DECLARE
    raw_id uuid;
    result text;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (
        source_id, discovered_url, canonical_url, raw_title, raw_content,
        content_hash, ingestion_status, metadata, ingestion_run_id
    )
    SELECT source_id, 'https://example.test/t06', 'https://example.test/t06',
           'Updated instant payments launch', 'duplicate URL evidence', 'm33-t17',
           'RAW', '{"test_id":"T17"}'::jsonb, run_id
    FROM m33_test_state
    RETURNING id INTO raw_id;

    result := public.gpir_process_raw_record(raw_id);
    PERFORM pg_temp.m33_assert('T17', result = 'DUPLICATE',
        'duplicate canonical URL must not mutate the prior candidate');
END
$t17$;

-- T23 already-processed guard.
DO $t23$
DECLARE
    raw_id uuid;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (
        source_id, discovered_url, canonical_url, raw_title, raw_content,
        content_hash, ingestion_status, metadata, ingestion_run_id
    )
    SELECT source_id, 'https://example.test/t23', 'https://example.test/t23',
           'Already processed payment record', 'processed evidence', 'm33-t23',
           'PROCESSED', '{"test_id":"T23"}'::jsonb, run_id
    FROM m33_test_state
    RETURNING id INTO raw_id;

    PERFORM pg_temp.m33_assert('T23',
        public.gpir_process_raw_record(raw_id) = 'ALREADY_PROCESSED',
        'processed RAW must not run either gate again');
END
$t23$;

-- T24 missing RAW identity.
SELECT pg_temp.m33_assert('T24',
    public.gpir_process_raw_record('00000000-0000-0000-0000-000000000000'::uuid) = 'NOT_FOUND',
    'unknown RAW ID must return NOT_FOUND without writes');

-- T25 lower batch bound clamps to one.
DO $t25$
DECLARE
    processed_count integer;
    remaining_count integer;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (
        source_id, discovered_url, canonical_url, raw_title, raw_content,
        content_hash, ingestion_status, metadata, ingestion_run_id
    )
    SELECT state.source_id,
           'https://example.test/t25-' || series.value,
           'https://example.test/t25-' || series.value,
           'General organization update ' || series.value,
           'batch lower evidence', 'm33-t25-' || series.value, 'RAW',
           pg_catalog.jsonb_build_object('test_id', 'T25'), state.run_id
    FROM m33_test_state state
    CROSS JOIN pg_catalog.generate_series(1, 2) AS series(value);

    SELECT pg_catalog.count(*) INTO processed_count
    FROM public.gpir_process_raw_batch(0);
    SELECT pg_catalog.count(*) INTO remaining_count
    FROM public.intelligence_raw_ingestion WHERE ingestion_status = 'RAW';

    PERFORM pg_temp.m33_assert('T25', processed_count = 1 AND remaining_count = 1,
        'batch lower bound must process exactly one RAW record');

    PERFORM public.gpir_process_raw_batch(1);
END
$t25$;

-- T26 upper batch bound clamps to one thousand.
DO $t26$
DECLARE
    processed_count integer;
    remaining_count integer;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (
        source_id, discovered_url, canonical_url, raw_title, raw_content,
        content_hash, ingestion_status, metadata, ingestion_run_id
    )
    SELECT state.source_id,
           'https://example.test/t26-' || series.value,
           'https://example.test/t26-' || series.value,
           'General organization update ' || series.value,
           'batch upper evidence', 'm33-t26-' || series.value, 'RAW',
           pg_catalog.jsonb_build_object('test_id', 'T26'), state.run_id
    FROM m33_test_state state
    CROSS JOIN pg_catalog.generate_series(1, 1001) AS series(value);

    SELECT pg_catalog.count(*) INTO processed_count
    FROM public.gpir_process_raw_batch(5000);
    SELECT pg_catalog.count(*) INTO remaining_count
    FROM public.intelligence_raw_ingestion WHERE ingestion_status = 'RAW';

    PERFORM pg_temp.m33_assert('T26', processed_count = 1000 AND remaining_count = 1,
        'batch upper bound must process at most one thousand RAW records');
END
$t26$;

-- T27 REVIEW cannot create a handoff.
SELECT pg_temp.m33_assert('T27',
    public.gpir_create_canonical_handoff((
        SELECT candidate.id
        FROM public.intelligence_candidates candidate
        JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
        WHERE raw.metadata ->> 'test_id' = 'T13'
    )) = 'NOT_VALIDATED',
    'REVIEW must remain quarantined');

-- T28 REJECT creates no candidate and therefore no handoff path.
SELECT pg_temp.m33_assert('T28',
    NOT EXISTS (
        SELECT 1
        FROM public.intelligence_candidates candidate
        JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
        WHERE raw.metadata ->> 'test_id' = 'T14'
    ),
    'Gate 2 rejection must create no handoff-eligible candidate');

-- T29 PENDING candidate cannot create a handoff.
SELECT pg_temp.m33_assert('T29',
    public.gpir_create_canonical_handoff((
        SELECT candidate.id
        FROM public.intelligence_candidates candidate
        JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
        WHERE raw.metadata ->> 'test_id' = 'T06'
    )) = 'NOT_VALIDATED',
    'unvalidated candidate must not create a handoff');

-- T30 validated candidate creates exactly one pending handoff.
DO $t30$
DECLARE
    selected_candidate_id uuid;
    result text;
BEGIN
    SELECT candidate.id INTO selected_candidate_id
    FROM public.intelligence_candidates candidate
    JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
    WHERE raw.metadata ->> 'test_id' = 'T06';

    UPDATE public.intelligence_candidates
       SET candidate_status = 'APPROVED',
           validated_at = pg_catalog.now(),
           validation_version = 'M33-VALIDATION-1',
           ticker_eligible = false
     WHERE id = selected_candidate_id;

    result := public.gpir_create_canonical_handoff(selected_candidate_id);
    PERFORM pg_temp.m33_assert('T30',
        result = 'HANDOFF_CREATED'
        AND (SELECT pg_catalog.count(*) FROM public.intelligence_canonical_handoffs WHERE candidate_id = selected_candidate_id) = 1,
        'validated candidate must create one staging handoff');
END
$t30$;

-- T31 repeating a handoff is idempotent.
SELECT pg_temp.m33_assert('T31',
    public.gpir_create_canonical_handoff((
        SELECT candidate.id
        FROM public.intelligence_candidates candidate
        JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
        WHERE raw.metadata ->> 'test_id' = 'T06'
    )) = 'HANDOFF_EXISTS',
    'duplicate handoff request must return the existing identity');

CREATE TEMP TABLE m33_publication_snapshot AS
SELECT pg_catalog.count(*) AS row_count,
       pg_catalog.md5(coalesce(
           pg_catalog.string_agg(pg_catalog.to_jsonb(announcement)::text, '|' ORDER BY announcement.id::text),
           ''
       )) AS content_digest
FROM public.global_announcements announcement;

-- T32 handoff failure changes only the staging handoff status.
DO $t32$
DECLARE
    before_count bigint;
    before_digest text;
    after_count bigint;
    after_digest text;
BEGIN
    SELECT row_count, content_digest INTO before_count, before_digest
    FROM m33_publication_snapshot;

    UPDATE public.intelligence_canonical_handoffs
       SET handoff_status = 'FAILED',
           failed_at = pg_catalog.now(),
           failure_code = 'ISOLATED_TEST_FAILURE'
     WHERE candidate_id = (
        SELECT candidate.id
        FROM public.intelligence_candidates candidate
        JOIN public.intelligence_raw_ingestion raw ON raw.id = candidate.raw_ingestion_id
        WHERE raw.metadata ->> 'test_id' = 'T06'
     );

    SELECT pg_catalog.count(*),
           pg_catalog.md5(coalesce(
               pg_catalog.string_agg(pg_catalog.to_jsonb(announcement)::text, '|' ORDER BY announcement.id::text),
               ''
           ))
      INTO after_count, after_digest
      FROM public.global_announcements announcement;

    PERFORM pg_temp.m33_assert('T32',
        before_count = after_count AND before_digest = after_digest,
        'failed handoff must leave Last-Known-Good publication unchanged');
END
$t32$;

-- T33 processor definitions contain no publication-table reference.
SELECT pg_temp.m33_assert('T33',
    pg_catalog.pg_get_functiondef('public.gpir_process_raw_record(uuid)'::regprocedure)
        !~* 'global_announcements'
    AND pg_catalog.pg_get_functiondef('public.gpir_process_raw_batch(integer)'::regprocedure)
        !~* 'global_announcements',
    'processors must have no direct publication write or reference');

-- T34 existing publication rows remain byte-for-byte equivalent.
SELECT pg_temp.m33_assert('T34',
    (SELECT row_count FROM m33_publication_snapshot) =
        (SELECT pg_catalog.count(*) FROM public.global_announcements)
    AND (SELECT content_digest FROM m33_publication_snapshot) =
        (SELECT pg_catalog.md5(coalesce(
            pg_catalog.string_agg(pg_catalog.to_jsonb(announcement)::text, '|' ORDER BY announcement.id::text),
            ''
        )) FROM public.global_announcements announcement),
    'existing announcement count and content digest must be unchanged');

-- T35 is a repository/static assertion in test-m33-g1-step-6a.js; this marker
-- keeps the complete T01-T35 result register explicit in the isolated harness.
SELECT pg_temp.m33_assert('T35', true,
    'legacy scraper SHA and protected-file state are validated outside PostgreSQL');

DO $final_result$
DECLARE
    covered integer;
BEGIN
    SELECT pg_catalog.count(DISTINCT test_id) INTO covered
    FROM m33_test_results WHERE passed;

    IF covered <> 35 THEN
        RAISE EXCEPTION 'M33-G1 isolated harness covered % of 35 cases', covered;
    END IF;
END
$final_result$;

SELECT test_id, pg_catalog.bool_and(passed) AS passed,
       pg_catalog.string_agg(detail, '; ' ORDER BY detail) AS detail
FROM m33_test_results
GROUP BY test_id
ORDER BY test_id;

ROLLBACK;
