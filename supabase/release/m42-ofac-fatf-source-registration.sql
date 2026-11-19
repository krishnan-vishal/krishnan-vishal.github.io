-- M42 controlled OFAC/FATF source activation.
-- Apply after migration 20261119090000 and before canaries/backfill.
-- This registers sources only. Hourly schedules are activated separately after
-- historical backfill and a successful non-dry current canary.

begin;

insert into public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url,
    poll_minutes, parser_profile, source_status
) values
    (
        'OFAC-US-001',
        'U.S. Department of the Treasury — Office of Foreign Assets Control',
        'USA',
        'United States',
        array['AMERICAS', 'GLOBAL'],
        'Official Sanctions Authority',
        'T1',
        'https://ofac.treasury.gov/sanctions-list-service',
        'A',
        'https://ofac.treasury.gov/recent-actions',
        60,
        'ofac-sls-regulatory-v1',
        'GREEN'
    ),
    (
        'FATF-GLOBAL-001',
        'Financial Action Task Force',
        'FRA',
        'Global',
        array['GLOBAL'],
        'Official Country Classification Authority',
        'T1',
        'https://www.fatf-gafi.org/en/topics/high-risk-and-other-monitored-jurisdictions.html',
        'A',
        'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html',
        60,
        'fatf-country-classification-v1',
        'GREEN'
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
