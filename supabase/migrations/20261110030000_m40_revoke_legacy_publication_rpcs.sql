-- M40 CUTOVER HOLD: this migration is intentionally non-executable until
-- the replacement publisher is deployed, trusted credentials work, and
-- existing Global Alerts publication has passed a live parity check.
-- Do not automatically revoke legacy RPC grants or unschedule the live job.
do $m40_cutover_hold$
begin
  raise exception 'M40_CUTOVER_NOT_AUTHORIZED: verify publisher parity and approve separate release';
end
$m40_cutover_hold$;

-- M40: the former non-CMS RPCs cannot be used by API service credentials.
-- This does not change table privileges or establish a Contentful trust boundary
-- for direct service-role writes or the existing editorial RPC.
revoke all on function public.gpir_publish_validated_candidate(uuid,text,timestamptz,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
  from public, anon, authenticated, service_role;
revoke all on function public.gpir_publish_t3_automatic_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
  from public, anon, authenticated, service_role;
