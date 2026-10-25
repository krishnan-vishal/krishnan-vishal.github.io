-- Owner-approved Sandbox test catalogue; JPY deferred.
-- DRAFT prevents checkout until all library-wide payment tests are ready.
-- Requires Premium Library scope migrations to be applied first.
INSERT INTO public.gpir_onetime_offers
 (pass_id, supabase_record_id, publication_id, sku, display_name, currency,
  unit_amount_minor, access_duration_days, environment, status)
SELECT 'GPIR_PREMIUM_LIBRARY_30D', NULL, 'PREMIUM_LIBRARY',
       'GPIR_PREMIUM_LIBRARY_30D', 'GPIR Premium Library - 30 Day Pass',
       currency_code, 999, 30, 'SANDBOX', 'DRAFT'
FROM (VALUES ('USD'),('EUR'),('GBP'),('SGD'),('AUD'),('CAD')) AS currencies(currency_code)
ON CONFLICT (pass_id, currency, environment) DO UPDATE
SET unit_amount_minor = EXCLUDED.unit_amount_minor,
    access_duration_days = EXCLUDED.access_duration_days,
    status = 'DRAFT',
    updated_at = now()
WHERE public.gpir_onetime_offers.status <> 'SANDBOX_ACTIVE';
