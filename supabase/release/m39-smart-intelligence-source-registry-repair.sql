-- M39 Smart Intelligence: bounded source-registry endpoint correction.
-- Evidence:
-- https://www.fintechaustralia.org.au/fintech-australia-news
-- https://www.ecb.europa.eu/home/html/rss.en.html
-- https://www.rba.gov.au/updates/rss-feeds.html
-- No source tier, eligibility threshold, parser, or publication status changes.

begin;

update public.source_registry
set official_url = 'https://www.fintechaustralia.org.au',
    feed_or_index_url = 'https://www.fintechaustralia.org.au/fintech-australia-news'
where source_id = 'AS-APAC-004'
  and source_name = 'FinTech Australia'
  and official_url in ('https://fintechaustralia.org.in', 'https://www.fintechaustralia.org.au');

update public.source_registry
set official_url = 'https://www.ecb.europa.eu',
    feed_or_index_url = 'https://www.ecb.europa.eu/rss/press.html'
where source_id = 'CB-EUR-001'
  and source_name = 'European Central Bank'
  and official_url in ('https://europa.eu', 'https://www.ecb.europa.eu');

update public.source_registry
set official_url = 'https://www.rba.gov.au',
    feed_or_index_url = 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml'
where source_id = 'TEST-RBA-01'
  and source_name = 'Reserve Bank of Australia'
  and (official_url is null or official_url = 'https://www.rba.gov.au');

commit;

