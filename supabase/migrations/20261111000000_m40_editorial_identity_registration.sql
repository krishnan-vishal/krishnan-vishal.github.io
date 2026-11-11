-- The dedicated publisher is the trusted caller: it must freshly verify the
-- Contentful Delivery entry before invoking this function. This function does
-- not publish content or establish PUBLIC access.
create function public.gpir_register_editorial_identity(
  p_entry_reference text,
  p_publication_type text,
  p_candidate_id uuid,
  p_source_url text,
  p_record_id uuid,
  p_publication_id text,
  p_lineage_id text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  identity_row public.gpir_identity_publications%rowtype;
  policy_row public.gpir_publication_access_policies%rowtype;
  candidate_row public.intelligence_candidates%rowtype;
  source_row public.source_registry%rowtype;
  source_key text;
  mapped_id uuid;
  matches integer;
  related public.gpir_identity_related_identifiers%rowtype;
  lineage text;
begin
  if p_entry_reference is null or p_entry_reference !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$'
     or length(p_entry_reference) > 300
     or length(btrim(coalesce(p_publication_type, ''))) = 0
     or p_evidence->>'contentful_delivery_verified' is distinct from 'true'
     or p_evidence->>'publication_status' is distinct from 'CURRENT'
     or p_evidence->>'validation_status' is distinct from 'PASS'
     or length(btrim(coalesce(p_evidence->>'source_validation_summary', ''))) < 40
     or coalesce(p_evidence->>'contentful_updated_at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
     or ((p_record_id is null or p_publication_id is null or p_lineage_id is null) and
         (p_record_id is not null or p_publication_id is not null or p_lineage_id is not null))
  then
    raise exception 'M40_IDENTITY_REVIEW_REQUIRED: incomplete editorial identity evidence';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('m40:cms:' || p_entry_reference, 0));
  if p_candidate_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('m40:candidate:' || p_candidate_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('m40:source:' || coalesce(p_source_url, ''), 0));
    select * into candidate_row from public.intelligence_candidates where id = p_candidate_id;
    if not found or candidate_row.canonical_url is distinct from p_source_url
       or candidate_row.candidate_status not in ('PENDING', 'REVIEW', 'VALIDATING', 'APPROVED')
    then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: candidate source mismatch'; end if;
    select * into source_row from public.source_registry where source_id = candidate_row.source_id;
    if not found or source_row.source_status is distinct from 'GREEN'
       or source_row.trust_tier not in ('T1', 'T1.5', 'T2', 'T3')
    then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: source is not eligible'; end if;
    if not exists (
      select 1 from public.intelligence_publication_audits a
       where a.candidate_id = p_candidate_id
         and a.canonical_url = p_source_url
         and a.validation_payload->>'source_verified' = 'true'
         and a.validation_payload->>'canonical_verified' = 'true'
         and a.validation_payload->>'timestamp_verified' = 'true'
         and a.validation_payload->>'content_verified' = 'true'
         and a.validation_payload->>'relevance_verified' = 'true'
         and a.validation_payload->>'summary_grounded' = 'true'
    ) then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: source audit missing'; end if;
  end if;

  select count(distinct publication_id), min(publication_id::text)::uuid
    into matches, mapped_id
    from public.gpir_identity_related_identifiers
   where (identifier_type = 'cms' and relationship = 'contentful-entry'
          and identifier_value = p_entry_reference)
      or (p_candidate_id is not null and identifier_type = 'source'
          and relationship = 'intelligence-candidate'
          and identifier_value = p_candidate_id::text);
  if matches > 1 then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: conflicting related identities'; end if;
  if mapped_id is not null and exists (
    select 1 from public.gpir_identity_related_identifiers
     where publication_id = mapped_id and identifier_type = 'cms'
       and relationship = 'contentful-entry' and identifier_value <> p_entry_reference
  ) then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: publication already linked to another entry'; end if;
  if exists (
    select 1 from public.gpir_identity_related_identifiers
     where ((identifier_type = 'cms' and relationship = 'contentful-entry'
             and identifier_value = p_entry_reference)
         or (p_candidate_id is not null and identifier_type = 'source'
             and relationship = 'intelligence-candidate'
             and identifier_value = p_candidate_id::text))
       and verification_state <> 'VERIFIED'
  ) then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: unresolved related identity'; end if;

  if p_record_id is not null then
    if mapped_id is not null and mapped_id <> p_record_id then
      raise exception 'M40_IDENTITY_REVIEW_REQUIRED: editorial identity collision';
    end if;
    select p.* into identity_row
      from public.gpir_identity_publications p
      join public.gpir_identity_lineages l on l.id = p.lineage_id
     where p.id = p_record_id and p.gpir_publication_id = p_publication_id
       and l.edition_lineage_id = p_lineage_id and l.lineage_status = 'ACTIVE'
       and p.identity_status in ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED')
       and p.collision_state = 'none';
    if not found then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: publication identity mismatch'; end if;
  elsif mapped_id is not null then
    select * into identity_row from public.gpir_identity_publications where id = mapped_id;
    if not found or identity_row.identity_status not in ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED')
       or identity_row.collision_state <> 'none'
    then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: existing identity is not authoritative'; end if;
  else
    if p_source_url is not null and exists (
      select 1 from public.gpir_identity_publications where source_legacy_path = p_source_url
    ) then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: source already has a registry record'; end if;
    source_key := 'gpir:intake:publication:cms:' ||
      encode(sha256(convert_to(p_entry_reference, 'UTF8')), 'hex');
    select * into identity_row from public.gpir_identity_resolve(
      source_key, p_publication_type, 'm40-contentful-editorial-registration',
      p_source_url, null, null, '{}'::jsonb, null,
      jsonb_build_object('contentful_entry', p_entry_reference, 'candidate_id', p_candidate_id,
        'contentful_updated_at', p_evidence->>'contentful_updated_at'));
    if identity_row.identity_status not in ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED')
       or identity_row.collision_state <> 'none'
    then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: allocator did not assign identity'; end if;
  end if;
  if identity_row.publication_type is distinct from p_publication_type
     or (p_candidate_id is not null and identity_row.source_legacy_path is not null
         and identity_row.source_legacy_path is distinct from p_source_url)
  then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: publication source or type mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('m40:publication:' || identity_row.id::text, 0));
  if exists (
    select 1 from public.gpir_identity_related_identifiers
     where publication_id = identity_row.id and identifier_type = 'cms'
       and relationship = 'contentful-entry' and identifier_value <> p_entry_reference
  ) then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: publication already linked to another entry'; end if;

  -- A candidate relationship may only be created from the controlled draft ID
  -- or reused from an already verified registry relationship.
  if p_candidate_id is not null and
     split_part(p_entry_reference, '/', 3) <>
       'gpir-' || replace(lower(source_row.trust_tier), '.', '-') || '-' || p_candidate_id::text
     and not exists (
       select 1 from public.gpir_identity_related_identifiers
        where publication_id = identity_row.id and identifier_type = 'source'
          and relationship = 'intelligence-candidate'
          and identifier_value = p_candidate_id::text and verification_state = 'VERIFIED'
     )
  then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: candidate linkage lacks evidence'; end if;

  for related in
    insert into public.gpir_identity_related_identifiers
      (publication_id, identifier_type, identifier_value, relationship, evidence, verification_state)
    select identity_row.id, relation.identifier_type, relation.identifier_value, relation.relationship,
      p_evidence || jsonb_build_object('entry_reference', p_entry_reference,
        'candidate_id', p_candidate_id, 'source_url', p_source_url), 'VERIFIED'
    from (values
      ('cms'::text, p_entry_reference, 'contentful-entry'::text),
      ('source'::text, p_candidate_id::text, 'intelligence-candidate'::text)
    ) as relation(identifier_type, identifier_value, relationship)
    where relation.identifier_value is not null
    on conflict (publication_id, identifier_type, identifier_value, relationship) do nothing
    returning *
  loop
    insert into public.gpir_identity_events
      (entity_type, entity_id, event_type, new_state, actor_process, reason, provenance_evidence)
    values ('related-identifier', related.id, 'VERIFIED', to_jsonb(related),
      'm40-contentful-editorial-registration', 'Verified editorial identity linkage', related.evidence);
  end loop;

  insert into public.gpir_publication_access_policies
    (supabase_record_id, publication_id, access_class, classification_source, review_state)
  values (identity_row.id, identity_row.gpir_publication_id, 'ENTITLED',
    'M34_A3_UNRESOLVED_DEFAULT', 'OWNER_REVIEW')
  on conflict (supabase_record_id) do nothing;
  select * into policy_row from public.gpir_publication_access_policies
   where supabase_record_id = identity_row.id and publication_id = identity_row.gpir_publication_id;
  if not found then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: access policy mismatch'; end if;
  select edition_lineage_id into lineage from public.gpir_identity_lineages
   where id = identity_row.lineage_id and lineage_status = 'ACTIVE';
  if lineage is null then raise exception 'M40_IDENTITY_REVIEW_REQUIRED: inactive lineage'; end if;
  return jsonb_build_object('supabaseRecordId', identity_row.id,
    'gpirPublicationId', identity_row.gpir_publication_id, 'editionLineageId', lineage,
    'accessClass', policy_row.access_class, 'policyStatus', policy_row.status,
    'policyReviewState', policy_row.review_state, 'candidateId', p_candidate_id,
    'entryReference', p_entry_reference);
end
$function$;

revoke all on function public.gpir_register_editorial_identity(text, text, uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.gpir_register_editorial_identity(text, text, uuid, text, uuid, text, text, jsonb)
  to gpir_editorial_publisher;

-- Only PUBLIC policies are returned to the existing public reader functions.
-- Restricted publications continue to use resolve_publication_entitlement.
create function public.gpir_public_editorial_authorizations()
returns table(record_id uuid, publication_id text, lineage_id text, entry_reference text, candidate_id text,
              publication_type text)
language sql stable security definer set search_path = pg_catalog
as $function$
  select p.id, p.gpir_publication_id, l.edition_lineage_id, cms.identifier_value,
         candidate.identifier_value, p.publication_type::text
    from public.gpir_identity_publications p
    join public.gpir_identity_lineages l on l.id = p.lineage_id and l.lineage_status = 'ACTIVE'
    join public.gpir_publication_access_policies policy
      on policy.supabase_record_id = p.id and policy.publication_id = p.gpir_publication_id
     and policy.status = 'ACTIVE' and policy.access_class = 'PUBLIC'
    join public.gpir_identity_related_identifiers cms
      on cms.publication_id = p.id and cms.identifier_type = 'cms'
     and cms.relationship = 'contentful-entry' and cms.verification_state = 'VERIFIED'
    left join public.gpir_identity_related_identifiers candidate
      on candidate.publication_id = p.id and candidate.identifier_type = 'source'
     and candidate.relationship = 'intelligence-candidate' and candidate.verification_state = 'VERIFIED'
   where p.identity_status in ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED') and p.collision_state = 'none'
     and not exists (
       select 1 from public.gpir_identity_related_identifiers duplicate
        where duplicate.identifier_type = 'cms' and duplicate.relationship = 'contentful-entry'
          and duplicate.identifier_value = cms.identifier_value and duplicate.publication_id <> p.id)
     and not exists (
       select 1 from public.gpir_identity_related_identifiers duplicate
        where candidate.id is not null and duplicate.identifier_type = 'source'
          and duplicate.relationship = 'intelligence-candidate'
          and duplicate.identifier_value = candidate.identifier_value and duplicate.publication_id <> p.id)
   order by p.id, cms.identifier_value, candidate.identifier_value
$function$;
revoke all on function public.gpir_public_editorial_authorizations()
  from public, anon, authenticated;
grant execute on function public.gpir_public_editorial_authorizations() to service_role;
