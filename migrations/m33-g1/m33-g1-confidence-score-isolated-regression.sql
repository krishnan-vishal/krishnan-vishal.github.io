-- Isolated-only proof for the historical numeric(5,4) overflow and Step 6E-D2 fix.
DO $before_hotfix$
BEGIN
    BEGIN
        PERFORM 60::numeric(5,4);
        RAISE EXCEPTION 'expected numeric(5,4) overflow was not raised';
    EXCEPTION WHEN numeric_value_out_of_range THEN
        NULL;
    END;
END
$before_hotfix$;

DO $after_hotfix$
DECLARE
    precision_value integer;
    scale_value integer;
BEGIN
    SELECT numeric_precision, numeric_scale INTO STRICT precision_value, scale_value
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'intelligence_candidates'
       AND column_name = 'confidence_score';
    IF precision_value <> 5 OR scale_value <> 2 THEN RAISE EXCEPTION 'confidence score must be numeric(5,2)'; END IF;
    -- numeric(5,2) accepts 0, rounds 9.9999 to 10.00, and accepts Gate-2 scores.
    PERFORM 0::numeric(5,2), 9.9999::numeric(5,2), 35::numeric(5,2),
            60::numeric(5,2), 80::numeric(5,2), 100::numeric(5,2);
    BEGIN
        PERFORM 1000::numeric(5,2);
        RAISE EXCEPTION 'expected out-of-range score was not rejected';
    EXCEPTION WHEN numeric_value_out_of_range THEN NULL;
    END;
END
$after_hotfix$;
