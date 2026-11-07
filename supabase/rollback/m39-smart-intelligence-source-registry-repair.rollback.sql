-- Emergency rollback for the M39 source-registry endpoint correction.
-- Restores only the three pre-release endpoint values.

begin;

update public.source_registry
set official_url = 'https://fintechaustralia.org.in',
    feed_or_index_url = 'https://fintechaustralia.org.au'
where source_id = 'AS-APAC-004'
  and official_url = 'https://www.fintechaustralia.org.au';

update public.source_registry
set official_url = 'https://europa.eu',
    feed_or_index_url = 'https://europa.eu/rss/press.html'
where source_id = 'CB-EUR-001'
  and official_url = 'https://www.ecb.europa.eu';

update public.source_registry
set official_url = null,
    feed_or_index_url = 'https://rba.gov.au'
where source_id = 'TEST-RBA-01'
  and official_url = 'https://www.rba.gov.au';

commit;

