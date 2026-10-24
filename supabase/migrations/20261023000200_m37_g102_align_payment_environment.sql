-- M37 G1-02 preflight repair: align ledger environment with existing GPIR tables.
-- Safe for the existing Sandbox ledger; aborts rather than silently rewriting any LIVE rows.
do $$
begin
  if exists (select 1 from public.gpir_subscription_payment_evidence where environment = 'LIVE') then
    raise exception 'Legacy LIVE ledger rows require manual reconciliation before environment repair';
  end if;
end $$;
alter table public.gpir_subscription_payment_evidence
  drop constraint if exists gpir_subscription_payment_evidence_environment_check;
alter table public.gpir_subscription_payment_evidence
  add constraint gpir_subscription_payment_evidence_environment_check
  check (environment in ('SANDBOX','PRODUCTION'));
