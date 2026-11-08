-- M39 BIS/GDELT source registration through the existing governed registry.
-- BIS is an official statistical authority validated against its live SDMX v2 API
-- and permitted-use terms. GDELT is deliberately AMBER: it is a discovery index,
-- not the publisher or an authoritative source for publication eligibility.

begin;

insert into public.source_registry (
  source_id, source_name, country_iso3, country, region_tags, category,
  trust_tier, official_url, acquisition_method, feed_or_index_url,
  poll_minutes, parser_profile, source_status
) values (
  'BIS-GLOBAL-001', 'Bank for International Settlements', 'CHE', 'Global',
  array['GLOBAL'], 'Statistical Authority', 'T1', 'https://data.bis.org/',
  'A', 'https://stats.bis.org/api/v2/', 1440, 'bis-sdmx-csv-v2', 'GREEN'
), (
  'GDELT-GLOBAL-001', 'GDELT Project DOC 2.0', 'XGL', 'Global',
  array['GLOBAL'], 'Discovery Index', 'T3', 'https://api.gdeltproject.org/',
  'A', 'https://api.gdeltproject.org/api/v2/doc/doc', 60,
  'gdelt-doc-discovery', 'AMBER'
)
on conflict (source_id) do update set
  source_name = excluded.source_name,
  country_iso3 = excluded.country_iso3,
  country = excluded.country,
  region_tags = excluded.region_tags,
  category = excluded.category,
  trust_tier = excluded.trust_tier,
  official_url = excluded.official_url,
  acquisition_method = excluded.acquisition_method,
  feed_or_index_url = excluded.feed_or_index_url,
  poll_minutes = excluded.poll_minutes,
  parser_profile = excluded.parser_profile,
  source_status = excluded.source_status;

commit;
