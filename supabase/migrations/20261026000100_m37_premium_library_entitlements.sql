-- Additive Sandbox-only Premium Library entitlement foundation.
-- No access grants, offers, or production changes.
CREATE TABLE public.gpir_onetime_library_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_order_id uuid NOT NULL UNIQUE REFERENCES public.gpir_onetime_orders(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 scope text NOT NULL DEFAULT 'PREMIUM_LIBRARY' CHECK (scope = 'PREMIUM_LIBRARY'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
 effective_from timestamptz NOT NULL,
 effective_until timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT valid_window CHECK (effective_until > effective_from),
 CONSTRAINT valid_revocation CHECK (
  (status='ACTIVE' AND revoked_at IS NULL) OR
  (status='REVOKED' AND revoked_at IS NOT NULL)
 )
);
CREATE INDEX gpir_onetime_library_entitlements_lookup
 ON public.gpir_onetime_library_entitlements(user_id,status,effective_until);
ALTER TABLE public.gpir_onetime_library_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gpir_onetime_library_entitlements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.gpir_onetime_library_entitlements TO service_role;
