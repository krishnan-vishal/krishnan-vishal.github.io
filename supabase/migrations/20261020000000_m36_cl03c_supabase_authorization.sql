-- M36 CL-03C authorization correction.
-- Owner review and verification of the workflow JWT role are required before
-- applying. This migration is a candidate only; it is not applied by this repo.

CREATE OR REPLACE FUNCTION public.gpir_cl03c_identity_readback(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  gpir_publication_id text,
  identity_status text,
  collision_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  returned_rows bigint;
  approved_ids constant uuid[] := ARRAY[
    'ef992d9e-f2a6-4f65-94d2-ebec897c1339'::uuid,
    '1871bb85-709e-42bd-9cfd-f26e4688a7b7'::uuid,
    '2abed19a-3144-460d-a311-82f2ad9bad2f'::uuid,
    '754e2bcc-43f4-48de-8b7b-7d1f5da4c64a'::uuid,
    '1404ef1b-33f5-4b1f-98f0-c7535f71f3c9'::uuid
  ];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'CL-03C identity readback is restricted to the verified workflow role'
      USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) <> cardinality(approved_ids) OR
     (SELECT count(DISTINCT supplied_id) FROM unnest(p_ids) AS supplied(supplied_id))
       <> cardinality(approved_ids) OR
     NOT (p_ids @> approved_ids AND p_ids <@ approved_ids) THEN
    RAISE EXCEPTION 'CL-03C identity readback accepts only the approved five-record set'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT publication.id, publication.gpir_publication_id,
           publication.identity_status, publication.collision_state
      FROM public.gpir_identity_publications AS publication
     WHERE publication.id = ANY (p_ids);

  GET DIAGNOSTICS returned_rows = ROW_COUNT;
  IF returned_rows <> cardinality(approved_ids) THEN
    RAISE EXCEPTION 'CL-03C identity readback did not find the approved record set'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.gpir_cl03c_identity_readback(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_cl03c_identity_readback(uuid[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.gpir_cl03c_policy_write_preflight()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT has_table_privilege(
           current_user, 'public.gpir_publication_access_policies', 'SELECT'
         )
     AND has_table_privilege(
           current_user, 'public.gpir_publication_access_policies', 'INSERT'
         )
     AND has_table_privilege(
           current_user, 'public.gpir_publication_access_policies', 'UPDATE'
         );
$function$;

REVOKE ALL ON FUNCTION public.gpir_cl03c_policy_write_preflight()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_cl03c_policy_write_preflight()
  TO service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.gpir_publication_access_policies
  TO service_role;
