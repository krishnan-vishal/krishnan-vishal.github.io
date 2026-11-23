begin;

alter table public.gpir_regulatory_documents
    drop constraint gpir_regulatory_documents_document_kind_check,
    add constraint gpir_regulatory_documents_document_kind_check
        check (document_kind in (
            'OFAC_CURRENT_SNAPSHOT', 'OFAC_DELTA', 'OFAC_RECENT_ACTION',
            'FATF_STATEMENT', 'UNSC_CURRENT_SNAPSHOT'
        ));

insert into public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url,
    poll_minutes, parser_profile, source_status
) values (
    'UNSC-GLOBAL-001', 'United Nations Security Council', 'USA', 'Global',
    array['GLOBAL'], 'Official Sanctions Authority', 'T1',
    'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', 'A',
    'https://scsanctions.un.org/resources/xml/en/name/consolidated.xml',
    60, 'unsc-consolidated-xml-v1', 'GREEN'
) on conflict (source_id) do nothing;

commit;
