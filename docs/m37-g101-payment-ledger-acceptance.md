# M37 Gate 1 — Payment ledger acceptance and follow-ups

Status (2026-10-24): **G1-01 and G1-02 Sandbox functional acceptance PASS; Production release NOT authorised.** Supersedes the outdated pre-acceptance status. No seed or additional checkout was used.

## G1-01 — restricted evidence ledger

Migration: `20261023000100_m37_g101_subscription_payment_evidence.sql`, followed by `20261023000200_m37_g102_align_payment_environment.sql`.

The original provider payment is recorded in Sandbox exactly once: local subscription `43361dfb-885c-4dfd-9e76-7aa770dfb039`, reader `53803c91-11cb-419e-822b-15f47b3a10a2`, PayPal subscription `I-674CH86A89ES`, transaction `7UC82239V8074274K`, USD 999 minor units, COMPLETED at `2026-10-18 12:46:46+00`, source PAYPAL_API, `matching_records = 1`.

The ledger schema defines unique transaction/event constraints, RLS, and revoked direct anon/authenticated privileges. `tests/m37/g101-ledger.sql` contains rollback-only synthetic assertions; the existing Gate 1 CI runs Node tests, **not** this SQL script. Do not claim its execution is independently verified. Run only in a disposable database if separate SQL-test sign-off is required.

## G1-02 — original payment reconciliation

Authenticated Sandbox API returned HTTP 200, ACTIVE, sandbox, SERVER_VERIFIED, `paymentConfirmed:true` for `I-674CH86A89ES`; the single real ledger row corroborates it. The original restricted writer's unassigned-record error was corrected in Sandbox. Its fix is preserved in the subsequent migration `20261024000100_m37_g102_fix_payment_writer_record.sql`; preserve migration order.

On commit `cd3c49e85e298cf60896ddcd4fa416dbba876e2e`, M37 Gate 1 Reconciliation Tests (run 40095876918) and GPIR Security and Integrity (run 40095876864) completed successfully. These checks do not establish Production deployment compatibility.

## Follow-ups / release holds

1. G1-03: server-verified, idempotent recurring payment webhook reconciliation, renewal, failure/refund/reversal handling, and entitlement consequences. Existing webhook verifies signatures and updates subscription status, but does not complete renewal payment evidence.
2. Production read-only schema/migration/RPC inventory, including legacy LIVE rows; environment-alignment migration intentionally aborts if such rows exist.
3. Production configuration/deployment inventory: verify environment, credential presence (never values), webhook ID, origins, merchant/plan mappings, feature flag and function versions without activation.
4. Production entitlement integration: verify deployed `resolve_publication_entitlement` for paid/unpaid/expired/revoked states and reader isolation. ACTIVE billing alone does not grant publication access.
5. Keep PR #466 Draft and Production unchanged pending evidenced checks and explicit owner release approval.

No additional payment, Production migration, deployment, live merchant mutation or PR merge is authorised here.
