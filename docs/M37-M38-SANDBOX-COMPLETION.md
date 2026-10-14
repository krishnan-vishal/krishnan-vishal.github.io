# M37/M38 Consolidated Sandbox Completion

Date: 2026-10-11

Branch: `work/m37-m38-sandbox-completion`

Approved Sandbox: `hoewtptllwkcqrgryazu`

Excluded production: `qlnvhfapctcpzqyuhhth`

## Result

- **M38 My GPIR: PASS in Sandbox.** The `503 READER_SUMMARY_UNAVAILABLE` defect is repaired, the authenticated dashboard is operating against the approved Sandbox, and security, route, desktop and mobile checks pass.
- **M37 PayPal lifecycle: HOLD at buyer approval.** Order `98U08950R3971671J` was created for the existing USD 1.00 offer. The available PayPal browser session returned `CANNOT_PAY_SELF`, so no buyer approval, capture, verified entitlement, refund or reversal was fabricated or claimed.
- **Production: HOLD.** No production access, deployment, merge or live-payment activation was performed.

## Persistent Codespaces preview

The Codespaces workspace starts the dashboard preview automatically and forwards port `4192`. The preview root opens `/reader/my-gpir/` and overrides the shared public Supabase config route in memory with the fixed Sandbox URL `https://hoewtptllwkcqrgryazu.supabase.co`; the checked-in production browser config is not modified or served by the preview.

Set a Codespaces secret named `GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY` to the `sb_publishable_` key from Sandbox project `hoewtptllwkcqrgryazu`. The preview refuses to provide browser configuration when the secret is absent or malformed and never falls back to the production project. Codespaces injects the saved secret after restart; no key or `.env` file belongs in the repository. After restart/opening the workspace, use the forwarded **My GPIR Sandbox preview** port. The dashboard still requires an authenticated Sandbox reader session.

## M38 repair and deployment

The failure was not caused by missing tables or by the modern `sb_secret_` key format. Direct REST reads of the canonical M34 policy/profile tables correctly returned PostgreSQL `42501` because their permission boundary does not grant direct `service_role` SELECT access.

`gpir-reader-summary` now obtains candidate publications from the existing active Sandbox offer and the authenticated reader's purchase entitlements, then calls `resolve_publication_entitlement(text,text)` for every candidate. It does not duplicate policy logic, relax grants, expose server credentials, accept a caller-selected user ID or infer access from a browser redirect.

Only `gpir-reader-summary` was deployed during this completion pass. Remote state is `ACTIVE`, version 7, JWT verification enabled, deployment hash `f7cf66de3e5674d5584ea5903976f6be709da1cc123f4b9a2ca5a3c051a8d366`.

Authenticated smoke result for the established Sandbox reader:

- session validation: `200`
- reader summary: `200`
- Profile: verified email displayed
- My Library: 0 authorised publications
- Payment History: one USD 1.00 order, status `CREATED`
- Purchases: 0 active one-time purchases
- Subscription & Plan: `NOT ENROLLED`; billing inactive
- anonymous request: `401 SESSION_REQUIRED`
- malformed bearer: `401`
- unapproved origin: `403 ORIGIN_NOT_ALLOWED`
- caller-supplied `user_id`: ignored; response remained scoped to the authenticated reader

## M37 transaction evidence

The existing offer `328c82c1-dcd7-4d7f-bec0-13b3ef101261` for publication `VK-GPIR-P-000000000001-8` was used without alteration or duplication.

- PayPal order: `98U08950R3971671J`
- amount: USD 1.00
- local/provider pre-approval state: `CREATED` / `PAYER_ACTION_REQUIRED`
- pre-approval capture attempt: HTTP `409`, `PAYPAL_CAPTURE_FAILED`
- `captured_at`: unset
- purchase-entitlement rows: 0

This proves that order creation, an approval URL and browser activity cannot independently grant access. The open PayPal environment was authenticated as the merchant and returned `CANNOT_PAY_SELF`; a distinct Sandbox buyer must approve the order before the remaining live lifecycle checks can proceed.

Automated contract tests pass for completed capture verification, amount mismatch rejection, duplicate webhook suppression, invalid signature rejection, independently verified completion webhooks and governed refund handling. These are implementation checks, not claims that an unperformed PayPal transaction succeeded.

## Function integrity

The three PayPal functions were neither modified nor redeployed in this pass. Their remote hashes and JWT boundaries remain:

| Function | JWT verification | Deployment hash |
|---|---:|---|
| `gpir-paypal-create-order` | enabled | `55b28dc56ad32d4827ca17085853138bfc236bd65038e07fcb224a065ea532ed` |
| `gpir-paypal-capture-order` | enabled | `fec563164e04500faebe88a0c93ef27abff565014d0e45ed1e22ba4819f3fb58` |
| `gpir-paypal-webhook` | disabled at gateway; PayPal signature required in function | `9989e20c127b258cb05b2214ea6a211137c630e861726947e22aea38ee8a9885` |

## Verification

- M34–M38 regression suite: **139/139 PASS**
- syntax checks: reader-summary handler and isolated preview server PASS
- desktop QA: 1440×1000, no horizontal overflow, Overview active
- mobile QA: 390×844, no horizontal overflow, five vertical navigation boxes
- section active states: Overview, Profile, My Library, Payment History, Subscription & Plan PASS
- character encoding check: PASS

Authenticated desktop and mobile evidence was retained locally and excluded from Git because it contains reader-specific Sandbox data.

## Changed and deployed scope

Material completion-pass files:

- `supabase/functions/gpir-reader-summary/handler.mjs`
- `tests/m38/my-gpir-dashboard.test.mjs`
- `reader/my-gpir/index.html`
- `scripts/m38/serve-my-gpir-preview.mjs`
- `docs/M38-MY-GPIR-READER-DASHBOARD.md`
- `docs/M37-M38-SANDBOX-COMPLETION.md`
- safe static preview evidence under `artifacts/m38/`; authenticated screenshots remain local-only

Deployed: only `supabase/functions/gpir-reader-summary/`.

Not deployed: database changes, PayPal functions, live checkout, production site or any production resource.

## Outstanding owner action

Use a distinct PayPal Sandbox buyer account (not the merchant account) to approve order `98U08950R3971671J`. After approval, rerun the existing capture flow and verify, in order: `COMPLETED` capture, one entitlement only, duplicate capture/webhook idempotency, then an owner-approved Sandbox refund or reversal and entitlement revocation. Do not recreate the offer or create another order unless PayPal reports this order unusable.

## Release recommendation

Accept M38 for the controlled Sandbox milestone. Keep consolidated M37/M38 and all production release activity on **HOLD** until the distinct Sandbox buyer completes approval and the remaining live capture/idempotency/refund evidence passes. No merge or production deployment is recommended without a separate owner approval.
