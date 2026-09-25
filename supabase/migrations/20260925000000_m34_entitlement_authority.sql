-- M34-A3: browser-safe publication entitlement authority.
-- Existing governed publications are fail-closed as ENTITLED/OWNER_REVIEW until
-- an owner supplies evidenced classifications. This migration does not grant a
-- user access and does not modify identity-registry data.

CREATE TABLE public.gpir_user_access_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_class text NOT NULL CHECK (access_class IN ('ENTITLED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpir_user_access_window CHECK
    (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE public.gpir_publication_access_policies (
  supabase_record_id uuid PRIMARY KEY
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL UNIQUE,
  access_class text NOT NULL
    CHECK (access_class IN ('PUBLIC', 'AUTHENTICATED', 'ENTITLED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  classification_source text NOT NULL,
  review_state text NOT NULL DEFAULT 'OWNER_REVIEW'
    CHECK (review_state IN ('OWNER_REVIEW', 'EVIDENCED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.gpir_validate_publication_policy_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.gpir_identity_publications AS publication
     WHERE publication.id = NEW.supabase_record_id
       AND publication.gpir_publication_id = NEW.publication_id
       AND publication.identity_status IN ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED')
  ) THEN
    RAISE EXCEPTION 'Publication policy identity pair is not governed and active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gpir_publication_policy_identity
BEFORE INSERT OR UPDATE OF supabase_record_id, publication_id
ON public.gpir_publication_access_policies
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();

ALTER TABLE public.gpir_user_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_publication_access_policies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gpir_user_access_profiles,
  public.gpir_publication_access_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gpir_validate_publication_policy_identity()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.resolve_publication_entitlement(
  p_publication_id text,
  p_supabase_record_id text
)
RETURNS TABLE(decision text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  policy public.gpir_publication_access_policies%ROWTYPE;
  caller uuid := auth.uid();
BEGIN
  IF p_publication_id IS NULL OR btrim(p_publication_id) = '' OR
     p_supabase_record_id IS NULL OR
     p_supabase_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'DENY'::text;
    RETURN;
  END IF;

  SELECT access_policy.* INTO policy
    FROM public.gpir_publication_access_policies AS access_policy
   WHERE access_policy.publication_id = p_publication_id
     AND access_policy.supabase_record_id::text = lower(p_supabase_record_id);

  IF NOT FOUND OR policy.status <> 'ACTIVE' THEN
    RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'PUBLIC' THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF caller IS NULL THEN
    RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'AUTHENTICATED' THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF policy.access_class = 'ENTITLED' AND EXISTS (
    SELECT 1 FROM public.gpir_user_access_profiles AS profile
     WHERE profile.user_id = caller
       AND profile.access_class = 'ENTITLED'
       AND profile.status = 'ACTIVE'
       AND profile.effective_from <= CURRENT_TIMESTAMP
       AND (profile.effective_until IS NULL OR
            profile.effective_until > CURRENT_TIMESTAMP)
  ) THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSE
    RETURN QUERY SELECT 'DENY'::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_publication_entitlement(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publication_entitlement(text, text)
  TO anon, authenticated;

-- The repository contains no evidenced PUBLIC/AUTHENTICATED classifications.
-- Seed every assigned governed identity fail-closed and expose the review state.
INSERT INTO public.gpir_publication_access_policies
  (supabase_record_id, publication_id, access_class, classification_source, review_state)
SELECT id, gpir_publication_id, 'ENTITLED',
       'M34_A3_UNRESOLVED_DEFAULT', 'OWNER_REVIEW'
  FROM public.gpir_identity_publications
 WHERE identity_status IN ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED')
   AND gpir_publication_id IS NOT NULL
ON CONFLICT (supabase_record_id) DO NOTHING;

COMMENT ON FUNCTION public.resolve_publication_entitlement(text, text) IS
  'Returns only ALLOW or DENY for the exact governed publication pair and current auth.uid(). Provider faults surface as RPC errors.';
