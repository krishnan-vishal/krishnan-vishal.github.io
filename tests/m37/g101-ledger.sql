-- Run only in a disposable database AFTER applying the G1-01 migration.
-- Transaction rolls back all fixture rows. These are synthetic values, NOT PayPal verification.
begin;
do $$
declare
  owner_a uuid := '11111111-1111-4111-8111-111111111111';
  owner_b uuid := '22222222-2222-4222-8222-222222222222';
  sub_a uuid := '33333333-3333-4333-8333-333333333333';
  blocked boolean;
begin
  insert into public.gpir_subscription_payment_evidence
    (environment,local_subscription_id,reader_user_id,paypal_subscription_id,
     paypal_transaction_id,currency,gross_amount_minor,provider_status,
     provider_completed_at,provider_evidence_source,provider_event_id)
  values ('SANDBOX',sub_a,owner_a,'I-TESTG101','TESTG101TXN','USD',999,
          'COMPLETED','2026-10-18T12:46:46Z','PAYPAL_API','TESTG101EVENT');
  blocked := false;
  begin
    insert into public.gpir_subscription_payment_evidence
      (environment,local_subscription_id,reader_user_id,paypal_subscription_id,
       paypal_transaction_id,currency,gross_amount_minor,provider_status,
       provider_completed_at,provider_evidence_source)
    values ('SANDBOX',sub_a,owner_b,'I-TESTG101','TESTG101TXN','USD',999,
            'COMPLETED','2026-10-18T12:46:46Z','PAYPAL_API');
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'Duplicate provider transaction accepted'; end if;
  blocked := false;
  begin
    insert into public.gpir_subscription_payment_evidence
      (environment,local_subscription_id,reader_user_id,paypal_subscription_id,
       paypal_transaction_id,currency,gross_amount_minor,provider_status,
       provider_completed_at,provider_evidence_source,provider_event_id)
    values ('SANDBOX',sub_a,owner_a,'I-TESTG101','TESTG101OTHER','USD',999,
            'COMPLETED','2026-10-18T12:46:46Z','PAYPAL_API','TESTG101EVENT');
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'Duplicate provider event accepted'; end if;
  blocked := false;
  begin
    insert into public.gpir_subscription_payment_evidence
      (environment,local_subscription_id,reader_user_id,paypal_subscription_id,
       paypal_transaction_id,currency,gross_amount_minor,provider_status,
       provider_completed_at,provider_evidence_source)
    values ('SANDBOX',sub_a,owner_a,'I-TESTG101','TESTG101BAD','USD',0,
            'COMPLETED','2026-10-18T12:46:46Z','PAYPAL_API');
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Nonpositive payment accepted'; end if;
  if has_table_privilege('authenticated',
      'public.gpir_subscription_payment_evidence','INSERT')
     or has_table_privilege('authenticated',
      'public.gpir_subscription_payment_evidence','UPDATE')
     or has_table_privilege('authenticated',
      'public.gpir_subscription_payment_evidence','SELECT')
  then raise exception 'Reader role has direct ledger privileges'; end if;
  if exists (select 1 from pg_policies where schemaname='public'
    and tablename='gpir_subscription_payment_evidence')
  then raise exception 'Unexpected reader-facing ledger policy'; end if;
  raise notice 'G1-01 synthetic database assertions passed';
end $$;
rollback;
