-- GPIR M39 verified research-source reconciliation.
-- Apply only after the matching gpir-intelligence-fetch deployment.
-- This registers two machine-verifiable T3 sources as GREEN. FXC remains
-- discovery-only because current research bodies are access-controlled.
-- Finextra Payments remains DISABLED because the registered feed returns 403
-- to the declared GPIR agent. No schedule is created by this registration.
begin;

insert into public.source_registry (
  source_id, source_name, country_iso3, country, region_tags, category,
  trust_tier, official_url, acquisition_method, feed_or_index_url,
  poll_minutes, parser_profile, source_status
) values
  ('FINTECHNEWS-SG-008', 'FinTech News Singapore', 'SGP', 'Singapore', null,
   'Financial Services Media', 'T3', 'https://fintechnews.sg/', 'A',
   'https://fintechnews.sg/payments/feed/', 30, 'wordpress-payments-v1', 'GREEN'),
  ('ATLAS-APAC-009', 'Atlas Technologies Research', 'SGP', 'Singapore', null,
   'Payments Research', 'T3', 'https://sg.atlstech.com/', 'A',
   'https://sg.atlstech.com/category/insight/blogs/payments-research/feed/',
   60, 'wordpress-payments-v1', 'GREEN'),
  ('FXC-GLOBAL-010', 'FXC Intelligence', 'XGL', 'Global', null,
   'Payments Intelligence', 'T3', 'https://www.fxcintel.com/', 'C',
   'https://www.fxcintel.com/research', 1440, 'standard-html', 'DISABLED')
on conflict (source_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.source_registry
    where source_id = 'FINTECHNEWS-SG-008' and trust_tier = 'T3'
      and official_url = 'https://fintechnews.sg/'
      and feed_or_index_url = 'https://fintechnews.sg/payments/feed/'
      and parser_profile = 'wordpress-payments-v1' and source_status = 'GREEN'
  ) then raise exception 'FINTECHNEWS_SOURCE_REGISTRY_MISMATCH'; end if;

  if not exists (
    select 1 from public.source_registry
    where source_id = 'ATLAS-APAC-009' and trust_tier = 'T3'
      and official_url = 'https://sg.atlstech.com/'
      and feed_or_index_url = 'https://sg.atlstech.com/category/insight/blogs/payments-research/feed/'
      and parser_profile = 'wordpress-payments-v1' and source_status = 'GREEN'
  ) then raise exception 'ATLAS_SOURCE_REGISTRY_MISMATCH'; end if;

  if not exists (
    select 1 from public.source_registry
    where source_id = 'FXC-GLOBAL-010' and trust_tier = 'T3'
      and source_status = 'DISABLED'
  ) then raise exception 'FXC_SOURCE_MUST_REMAIN_DISABLED'; end if;

  if not exists (
    select 1 from public.source_registry
    where source_id = 'FINEXTRA-PAY-006' and source_status = 'DISABLED'
  ) then raise exception 'FINEXTRA_SOURCE_MUST_REMAIN_DISABLED'; end if;
end $$;

commit;
