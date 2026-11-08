-- Preserve acquired evidence and foreign-key history while disabling both adapters.
begin;

update public.source_registry
set source_status = 'DISABLED'
where source_id in ('BIS-GLOBAL-001', 'GDELT-GLOBAL-001')
  and parser_profile in ('bis-sdmx-csv-v2', 'gdelt-doc-discovery');

commit;
