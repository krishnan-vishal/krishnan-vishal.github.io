-- Proposed registration only; owner review and controlled application are required.
begin;
insert into public.source_registry (
  source_id, source_name, country_iso3, country, region_tags, category,
  trust_tier, official_url, acquisition_method, feed_or_index_url,
  poll_minutes, parser_profile, source_status
) values
  ('MOJALOOP-OSS-001', 'Mojaloop official repositories', 'XGL', 'Global', array['GLOBAL'],
   'Technical Reference', 'T2', 'https://github.com/mojaloop/helm', 'A',
   'https://api.github.com/repos/mojaloop/helm/releases', 1440, 'github-technical-history-v1', 'GREEN'),
  ('HYPERSWITCH-OSS-001', 'Hyperswitch official repository', 'XGL', 'Global', array['GLOBAL'],
   'Technical Reference', 'T2', 'https://github.com/juspay/hyperswitch', 'A',
   'https://api.github.com/repos/juspay/hyperswitch/releases', 1440, 'github-technical-history-v1', 'GREEN')
on conflict (source_id) do nothing;
commit;