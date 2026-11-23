begin;

alter table public.gpir_regulatory_documents
    drop constraint gpir_regulatory_documents_document_kind_check,
    add constraint gpir_regulatory_documents_document_kind_check check (document_kind in (
        'OFAC_CURRENT_SNAPSHOT', 'OFAC_DELTA', 'OFAC_RECENT_ACTION',
        'FATF_STATEMENT', 'UNSC_CURRENT_SNAPSHOT', 'US_REGULATORY_PROPOSAL'
    ));

insert into public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url,
    poll_minutes, parser_profile, source_status
) values
    ('CFPB-US-001', 'Consumer Financial Protection Bureau', 'USA', 'United States',
     array['North America'], 'Official Regulatory Authority', 'T1',
     'https://www.consumerfinance.gov/', 'A', 'https://www.federalregister.gov/agencies/consumer-financial-protection-bureau',
     60, 'federal-register-reference', 'GREEN'),
    ('ADB-REGIONAL-001', 'Asian Development Bank', 'PHL', 'Regional',
     array['APAC'], 'Multilateral Research', 'T1',
     'https://www.adb.org/', 'A', 'https://asianbondsonline.adb.org/abm.php',
     60, 'adb-publication-reference', 'GREEN')
on conflict (source_id) do nothing;

insert into public.gpir_regulatory_documents (
    source_id, document_identity, canonical_url, document_kind, publication_date,
    publication_precision, retrieved_at, content_sha256, media_type, http_status, validation_state, metadata
) values
    ('OFAC-US-001', 'FR-2025-19347',
     'https://www.govinfo.gov/content/pkg/FR-2025-10-02/html/2025-19347.htm',
     'OFAC_RECENT_ACTION', date '2025-10-02', 'DATE_ONLY', '2026-11-23T06:32:44.225023Z',
     'f8bb29cea4c91af218a5ca0138125177aff77d2ca1451ad9a7ba2babce15ee3e',
     'text/html', 200, 'VALIDATED',
     '{"reader_reference":true,"title":"OFAC Notice of Sanctions Actions","summary":"Treasury published notice of OFAC sanctions actions in the Federal Register on October 2, 2025. The notice identifies September 24, 2025 as the date the action was issued.","action_issued_date":"2025-09-24"}'),
    ('CFPB-US-001', 'FR-2024-22004',
     'https://www.federalregister.gov/documents/2024/09/30/2024-22004/remittance-transfers-under-the-electronic-fund-transfer-act-regulation-e',
     'US_REGULATORY_PROPOSAL', date '2024-09-30', 'DATE_ONLY', '2026-11-23T06:52:04.063797Z',
     '1f2b80c0c2df873fdb1e6672fcff21891d289b37b928950c7ef8b4957f4672df',
     'application/json', 200, 'VALIDATED',
     '{"reader_reference":true,"title":"CFPB proposed Regulation E remittance disclosure amendment","summary":"The CFPB proposed a targeted amendment to international remittance disclosures and accompanying model forms, addressing inquiries to the CFPB and state authorities. This record describes the proposal as published on September 30, 2024.","evidence_url":"https://www.federalregister.gov/api/v1/documents/2024-22004.json"}')
on conflict (source_id, document_identity, content_sha256) do nothing;

commit;
