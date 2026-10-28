-- Applied to Production as m37_production_disabled_payment_evidence_foundation.
-- Additive payment evidence tables; intentionally no reader grants or payment activation.
CREATE TABLE public.gpir_m37_onetime_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 currency text NOT NULL REFERENCES public.gpir_m37_currency_catalog(currency),
 amount_minor integer NOT NULL DEFAULT 999 CHECK (amount_minor=999),
 duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days=30),
 environment text NOT NULL DEFAULT 'PRODUCTION' CHECK (environment='PRODUCTION'),
 provider text NOT NULL DEFAULT 'PAYPAL_ORDERS_V2' CHECK (provider='PAYPAL_ORDERS_V2'),
 client_request_id uuid NOT NULL,
 paypal_order_id text UNIQUE,
 paypal_capture_id text UNIQUE,
 status text NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','APPROVED','PENDING','CAPTURED','DENIED','REFUNDED','REVERSED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 captured_at timestamptz,
 UNIQUE(user_id,client_request_id),
 CONSTRAINT captured_requires_capture CHECK (status <> 'CAPTURED' OR (paypal_order_id IS NOT NULL AND paypal_capture_id IS NOT NULL AND captured_at IS NOT NULL))
);
CREATE INDEX gpir_m37_onetime_orders_reader_idx ON public.gpir_m37_onetime_orders(user_id,created_at DESC);
CREATE TABLE public.gpir_m37_library_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_order_id uuid NOT NULL UNIQUE REFERENCES public.gpir_m37_onetime_orders(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
 effective_from timestamptz NOT NULL,
 effective_until timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_until>effective_from),
 CHECK((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL))
);
CREATE INDEX gpir_m37_library_entitlements_reader_idx ON public.gpir_m37_library_entitlements(user_id,status,effective_until);
CREATE TABLE public.gpir_m37_onetime_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_event_id text NOT NULL UNIQUE,
 event_type text NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','PROCESSED','IGNORED','ERROR')),
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
ALTER TABLE public.gpir_m37_onetime_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_m37_library_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_m37_onetime_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gpir_m37_onetime_orders,public.gpir_m37_library_entitlements,public.gpir_m37_onetime_webhook_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.gpir_m37_onetime_orders,public.gpir_m37_library_entitlements,public.gpir_m37_onetime_webhook_events TO service_role;
