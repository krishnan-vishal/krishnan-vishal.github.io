-- Return the governed external lineage identifier alongside the resolver result.
-- Keep the base tables private and delegate allocation to the existing authority.
begin;
create function public.gpir_drive_draft_identity(p_sha256 text)
returns table (id uuid, publication_id text, lineage_id text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  resolved public.gpir_identity_publications%rowtype;
begin
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid reviewed Drive source hash';
  end if;
  resolved := public.gpir_identity_resolve(
    'gpir:intake:publication:drive:' || p_sha256,
    'Research Publication', 'payload-drive-draft-intake', null, p_sha256
  );
  return query select resolved.id, resolved.gpir_publication_id, lineage.edition_lineage_id
    from public.gpir_identity_lineages lineage
    where lineage.id = resolved.lineage_id
      and resolved.identity_status = 'GOVERNED_ASSIGNED'
      and resolved.source_hash = p_sha256;
end;
$$;
revoke all on function public.gpir_drive_draft_identity(text) from public, anon, authenticated;
grant execute on function public.gpir_drive_draft_identity(text) to service_role;
commit;
