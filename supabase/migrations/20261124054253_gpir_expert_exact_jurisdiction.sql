create or replace function public.gpir_domain_experts(
    p_query text, p_region text, p_industry text, p_topic text, p_title text,
    p_letter text, p_page integer, p_jurisdiction text
) returns jsonb
language sql stable security definer set search_path = ''
as $$
    with published as materialized (
        select id, profile from public.gpir_domain_expert_releases
        where release_through >= current_date
    ), matched as materialized (
        select * from published
        where (p_letter = '' or left(profile->>'sortKey', 1) = lower(p_letter))
          and (p_region = '' or profile->'regions' ? p_region)
          and (p_jurisdiction = '' or profile->>'jurisdiction' = p_jurisdiction)
          and (p_industry = '' or profile->'industries' ? p_industry)
          and (p_topic = '' or profile->'topics' ? p_topic)
          and (p_title = '' or strpos(lower(profile->>'title'), lower(p_title)) > 0)
          and (p_query = '' or strpos(lower(concat_ws(' ', profile->>'name',
              profile->>'employer', profile->>'title', profile->>'jurisdiction', profile->>'topics')), lower(p_query)) > 0)
    ), page as (
        select * from matched order by profile->>'sortKey' collate "C", id
        limit 20 offset ((greatest(1, least(p_page, 1000)) - 1) * 20)
    )
    select jsonb_build_object(
        'total', (select count(*) from matched),
        'regions', (select coalesce(jsonb_agg(distinct value order by value), '[]') from published cross join lateral jsonb_array_elements_text(profile->'regions')),
        'jurisdictions', (select coalesce(jsonb_agg(distinct (profile->>'jurisdiction') order by (profile->>'jurisdiction')), '[]'::jsonb) from published where (p_region = '' or profile->'regions' ? p_region) and coalesce(profile->>'jurisdiction','') <> ''),
        'industries', (select coalesce(jsonb_agg(distinct value order by value), '[]') from published cross join lateral jsonb_array_elements_text(profile->'industries')),
        'topics', (select coalesce(jsonb_agg(distinct value order by value), '[]') from published cross join lateral jsonb_array_elements_text(profile->'topics')),
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

revoke all on function public.gpir_domain_experts(text,text,text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.gpir_domain_experts(text,text,text,text,text,text,integer,text) to service_role;

