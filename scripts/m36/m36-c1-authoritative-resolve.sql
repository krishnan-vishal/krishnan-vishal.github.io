BEGIN;

WITH resolved AS (
  SELECT (public.gpir_identity_resolve(
    'gpir:intake:publication:research:global-cross-border-payments-market-intelligence:v1:docx',
    'research-publication', 'M36-C1-20260927-01',
    'F:\RepositoryJFY26\Publications\Research Report\Dashboards\Global_CrossBorder_Payments_Report ver 1.docx',
    'F57CCA73682F6852024D200F344AA29DCADAA8E2A32FF98525EA767F5987975B',
    NULL, '{}'::jsonb, NULL,
    '{"batchId":"M36-C1-20260927-01","ownerSourceDecision":"OWNER_APPROVED","accessClass":"PUBLIC","dashboardRelationship":"NONE"}'::jsonb
  )).*
), policy AS (
  INSERT INTO public.gpir_publication_access_policies
    (supabase_record_id, publication_id, access_class, status,
     classification_source, review_state)
  SELECT id, gpir_publication_id, 'PUBLIC', 'ACTIVE',
         'M36_C1_FINAL_OWNER_DECISION', 'EVIDENCED'
    FROM resolved
  ON CONFLICT (supabase_record_id) DO UPDATE SET
    publication_id = EXCLUDED.publication_id,
    access_class = 'PUBLIC', status = 'ACTIVE',
    classification_source = 'M36_C1_FINAL_OWNER_DECISION',
    review_state = 'EVIDENCED', updated_at = now()
  RETURNING *
)
SELECT json_build_object(
  'candidateKey', 'global-cross-border-payments-market-intelligence-v1',
  'identity', (SELECT row_to_json(resolved) FROM resolved),
  'accessPolicy', (SELECT row_to_json(policy) FROM policy)
) AS m36_c1_result;

WITH resolved AS (
  SELECT (public.gpir_identity_resolve(
    'gpir:intake:publication:research:cross-border-payments-industry-landscape:jfy26-resequenced:docx',
    'research-publication', 'M36-C1-20260927-01',
    'F:\RepositoryJFY26\Publications\Research Report\Master Repository versions JFY26\Masters_Repository_Cross_Border_Payments_Resequenced.docx',
    'B8440EEB821FA7408B1F8F894FA8DFAC44819B06A3D901F420CE61DFBF59A2F7',
    NULL, '{}'::jsonb, NULL,
    '{"batchId":"M36-C1-20260927-01","ownerSourceDecision":"OWNER_APPROVED","accessClass":"PUBLIC","dashboardRelationship":"NONE"}'::jsonb
  )).*
), policy AS (
  INSERT INTO public.gpir_publication_access_policies
    (supabase_record_id, publication_id, access_class, status,
     classification_source, review_state)
  SELECT id, gpir_publication_id, 'PUBLIC', 'ACTIVE',
         'M36_C1_FINAL_OWNER_DECISION', 'EVIDENCED'
    FROM resolved
  ON CONFLICT (supabase_record_id) DO UPDATE SET
    publication_id = EXCLUDED.publication_id,
    access_class = 'PUBLIC', status = 'ACTIVE',
    classification_source = 'M36_C1_FINAL_OWNER_DECISION',
    review_state = 'EVIDENCED', updated_at = now()
  RETURNING *
)
SELECT json_build_object(
  'candidateKey', 'cross-border-payments-resequenced',
  'identity', (SELECT row_to_json(resolved) FROM resolved),
  'accessPolicy', (SELECT row_to_json(policy) FROM policy)
) AS m36_c1_result;

COMMIT;
