begin;

-- Payload and GPIR Core use separate databases. Only owner-released delivery
-- fields reach Core. No REVIEW record, internal checklist or draft is replicated.
create table public.gpir_domain_expert_releases (
    id text primary key check (id ~ '^gpir-expert:[0-9a-f]{32}$'),
    revision timestamptz not null,
    release_through date,
    profile jsonb,
    check ((profile is null) = (release_through is null))
);
alter table public.gpir_domain_expert_releases enable row level security;
revoke all on public.gpir_domain_expert_releases from public, anon, authenticated, service_role;

create function public.gpir_sync_domain_expert(
    p_id text, p_revision timestamptz, p_release_through date, p_profile jsonb
) returns boolean
language sql security definer set search_path = ''
as $$
    with changed as (
        insert into public.gpir_domain_expert_releases as previous (id, revision, release_through, profile)
        values (p_id, p_revision, p_release_through, p_profile)
        on conflict (id) do update set revision = excluded.revision,
            release_through = excluded.release_through, profile = excluded.profile
        where previous.revision < excluded.revision
        returning 1
    )
    select exists (select 1 from changed) or exists (
        select 1 from public.gpir_domain_expert_releases
        where id = p_id and revision = p_revision
          and profile is not distinct from p_profile
          and release_through is not distinct from p_release_through
    )
$$;
revoke all on function public.gpir_sync_domain_expert(text,timestamptz,date,jsonb) from public, anon, authenticated;
grant execute on function public.gpir_sync_domain_expert(text,timestamptz,date,jsonb) to service_role;

create or replace function public.gpir_domain_experts(
    p_query text, p_region text, p_jurisdiction text,
    p_page integer
) returns jsonb
language sql stable security definer set search_path = ''
as $$
    with published as materialized (
        select id, profile from public.gpir_domain_expert_releases
        where release_through >= current_date
    ), matched as materialized (
        select * from published
        where (p_region = '' or profile->'regions' ? p_region)
          and (p_jurisdiction = '' or profile->>'jurisdiction' = p_jurisdiction)
          and (p_query = '' or strpos(lower(concat_ws(' ', profile->>'name',
              profile->>'employer', profile->>'title', profile->>'jurisdiction', profile->>'topics')), lower(p_query)) > 0)
    ), page as (
        select * from matched order by profile->>'sortKey' collate "C", id
    )
    select jsonb_build_object(
        'total', (select count(*) from matched),
        'regions', (select coalesce(jsonb_agg(distinct value order by value), '[]') from published cross join lateral jsonb_array_elements_text(profile->'regions')),
        'jurisdictions', (select coalesce(jsonb_agg(distinct profile->>'jurisdiction' order by profile->>'jurisdiction'), '[]') from published),
        'cards', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'name', profile->'name', 'title', profile->'title',
            'employer', profile->'employer', 'jurisdiction', profile->'jurisdiction',
            'summary', profile->'summary', 'regions', profile->'regions',
            'industries', profile->'industries', 'topics', profile->'topics',
            'career', profile->'career', 'qualifications', profile->'qualifications',
            'contribution', profile->'contribution', 'recognition', profile->'recognition',
            'corrections', profile->'corrections', 'officialBio', profile->'officialBio',
            'checkedAt', profile->'checkedAt',
            'linkedin', profile->'linkedin', 'portrait', profile->'portrait'
        ) order by profile->>'sortKey' collate "C", id), '[]') from page)
    );
$$;

revoke all on function public.gpir_domain_experts(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.gpir_domain_experts(text,text,text,integer) to service_role;
commit;
