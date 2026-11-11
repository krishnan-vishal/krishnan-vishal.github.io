\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'gpir_editorial_publisher') then
    create role gpir_editorial_publisher nologin;
  end if;
end
$$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.source_registry(source_id text primary key, source_status text, trust_tier text);
create table public.intelligence_candidates(
  id uuid primary key, source_id text, canonical_url text, candidate_status text);
create table public.intelligence_publication_audits(
  candidate_id uuid, canonical_url text, validation_payload jsonb);

\ir ../../supabase/migrations/20260922000000_m35_identity_registry.sql
\ir ../../supabase/migrations/20260925000000_m34_entitlement_authority.sql
\ir ../../supabase/migrations/20261111000000_m40_editorial_identity_registration.sql

insert into public.source_registry values ('SOURCE', 'GREEN', 'T2');
insert into public.intelligence_candidates values
  ('11111111-1111-4111-8111-111111111111', 'SOURCE', 'https://source.example/article', 'REVIEW');
insert into public.intelligence_publication_audits values
  ('11111111-1111-4111-8111-111111111111', 'https://source.example/article',
   '{"source_verified":true,"canonical_verified":true,"timestamp_verified":true,
     "content_verified":true,"relevance_verified":true,"summary_grounded":true}'::jsonb);

do $$
declare
  first_result jsonb;
  repeated jsonb;
  owner_result jsonb;
  evidence jsonb := '{"contentful_delivery_verified":true,"publication_status":"CURRENT",
    "validation_status":"PASS","contentful_updated_at":"2026-11-10T12:00:00Z",
    "source_validation_summary":"Editor verified source evidence and the publication relevance."}'::jsonb;
  denied boolean;
begin
  if has_function_privilege('service_role',
    'public.gpir_register_editorial_identity(text,text,uuid,text,uuid,text,text,jsonb)', 'execute')
  then raise exception 'service role can register editorial identities'; end if;
  if not has_function_privilege('gpir_editorial_publisher',
    'public.gpir_register_editorial_identity(text,text,uuid,text,uuid,text,text,jsonb)', 'execute')
  then raise exception 'publisher role cannot register'; end if;

  first_result := public.gpir_register_editorial_identity(
    'space/master/gpir-t2-11111111-1111-4111-8111-111111111111',
    'Intelligence', '11111111-1111-4111-8111-111111111111',
    'https://source.example/article', null, null, null, evidence);
  if first_result->>'candidateId' <> '11111111-1111-4111-8111-111111111111'
     or first_result->>'supabaseRecordId' = first_result->>'candidateId'
     or first_result->>'policyReviewState' <> 'OWNER_REVIEW'
     or first_result->>'accessClass' <> 'ENTITLED'
  then raise exception 'unexpected registered identity: %', first_result; end if;
  repeated := public.gpir_register_editorial_identity(
    'space/master/gpir-t2-11111111-1111-4111-8111-111111111111',
    'Intelligence', '11111111-1111-4111-8111-111111111111',
    'https://source.example/article', null, null, null, evidence);
  if repeated is distinct from first_result then raise exception 'retry changed identity'; end if;
  if (select count(*) from public.gpir_identity_publications) <> 1
     or (select count(*) from public.gpir_identity_related_identifiers) <> 2
  then raise exception 'retry created duplicate registry rows'; end if;
  if exists (select 1 from public.gpir_public_editorial_authorizations())
  then raise exception 'owner-review default became public'; end if;
  update public.gpir_publication_access_policies set access_class = 'PUBLIC',
    classification_source = 'isolated-owner-fixture', review_state = 'EVIDENCED'
   where supabase_record_id = (first_result->>'supabaseRecordId')::uuid;
  if (select count(*) from public.gpir_public_editorial_authorizations()
       where candidate_id = '11111111-1111-4111-8111-111111111111'
         and entry_reference = 'space/master/gpir-t2-11111111-1111-4111-8111-111111111111') <> 1
  then raise exception 'evidenced PUBLIC identity was not returned'; end if;

  owner_result := public.gpir_register_editorial_identity(
    'space/master/owner-entry', 'Research Publication', null, null, null, null, null, evidence);
  if owner_result->>'candidateId' is not null or owner_result->>'supabaseRecordId' is null
  then raise exception 'owner entry incorrectly requires a discovery candidate'; end if;

  denied := false;
  begin
    perform public.gpir_register_editorial_identity(
      'space/master/second-owner-entry', 'Research Publication', null, null,
      (owner_result->>'supabaseRecordId')::uuid, owner_result->>'gpirPublicationId',
      owner_result->>'editionLineageId', evidence);
  exception when others then denied := true; end;
  if not denied then raise exception 'different CMS entry reused the owner publication identity'; end if;

  denied := false;
  begin
    perform public.gpir_register_editorial_identity(
      'space/master/not-approved', 'Intelligence', null, null, null, null, null,
      evidence || '{"validation_status":"Pending"}'::jsonb);
  exception when others then denied := true; end;
  if not denied then raise exception 'unapproved entry was registered'; end if;

  denied := false;
  begin
    perform public.gpir_register_editorial_identity(
      'space/master/other-entry', 'Intelligence',
      '11111111-1111-4111-8111-111111111111', 'https://source.example/article',
      null, null, null, evidence);
  exception when others then denied := true; end;
  if not denied then raise exception 'different CMS entry reused the candidate'; end if;

  denied := false;
  begin
    perform public.gpir_register_editorial_identity(
      'space/master/gpir-t2-11111111-1111-4111-8111-111111111111',
      'Intelligence', '11111111-1111-4111-8111-111111111111',
      'https://source.example/article', (owner_result->>'supabaseRecordId')::uuid,
      owner_result->>'gpirPublicationId', owner_result->>'editionLineageId', evidence);
  exception when others then denied := true; end;
  if not denied then raise exception 'conflicting publication identity was accepted'; end if;
end
$$;
