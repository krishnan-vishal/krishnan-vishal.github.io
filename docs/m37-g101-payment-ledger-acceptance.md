# M37 G1-01 — Subscription payment evidence ledger

Status: IMPLEMENTED IN DRAFT; NOT DEPLOYED OR ACCEPTANCE-TESTED.

Migration: `supabase/migrations/20261023000100_m37_g101_subscription_payment_evidence.sql`
Rollback-only synthetic assertions: `tests/m37/g101-ledger.sql`

Owner-provided Sandbox acceptance reference (for G1-02 reconciliation, **not** a seed or an independently verified API response):
- PayPal merchant activity: completed recurring payment, USD 9.99 gross.
- Transaction ID: `7UC82239V8074274K`
- Recurring subscription ID: `I-674CH86A89ES`
- Displayed timestamp: 2026-10-18 08:46:46 EDT.
- No real transaction is inserted by this migration or test.

G1-01 acceptance checklist:
1. Confirm the migration fits the target Sandbox schema and apply there, not Live.
2. Run `tests/m37/g101-ledger.sql` in a disposable database with the migration applied; expect the PASS notice and rollback.
3. Verify no authenticated or anonymous reader can directly read/write the ledger.
4. Check GitHub security/integrity checks on the final PR head.
5. Only then mark G1-01 PASS.

G1-02 must reconcile the actual provider transaction through the PayPal API or verified webhook, match it to the pre-existing GPIR subscription and authenticated reader, and use a restricted server-side write path. No browser-controlled payment-confirmation field is authoritative. ACTIVE subscription status alone does not grant publication access. Refund/reversal handling and entitlement integration remain separate Gate 1 deliverables.

No new checkout, duplicate subscription, production deployment, or live payment is authorized by this work.
