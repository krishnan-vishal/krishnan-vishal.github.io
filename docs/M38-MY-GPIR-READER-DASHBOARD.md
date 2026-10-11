# M38 — My GPIR Reader Dashboard

## Outcome

M38 completes the authenticated My GPIR account surface on the established M34–M37 reader and payment boundaries. It adds no database migration, no subscription billing workflow and no production activation.

## Implemented scope

- `/reader/my-gpir/` provides the authenticated overview, Profile, My Library, Payment History and Subscription & Plan sections.
- `/reader/profile/`, `/reader/library/`, `/reader/payments/` and `/reader/plan/` are stable section routes into the canonical dashboard.
- `gpir-reader-summary` authenticates the caller, reads only that reader's server-side account/payment records and calls `resolve_publication_entitlement(text,text)` for every publication exposed in My Library.
- The browser receives a deliberately reduced summary. It contains no service credential, PayPal provider identifier, raw entitlement record or direct payment-table access.
- `gpir:paypal-sandbox-captured` triggers a summary refresh only. It never grants access or changes browser-side entitlement state.
- Empty Library, Payment History and Plan states explicitly report that Sandbox purchases and subscription billing are not active.

## Security and release boundary

- `resolve_publication_entitlement` remains the publication-access authority.
- The existing Supabase reader session is reused; no parallel reader identity or entitlement model was added.
- Protected payment data is queried only inside the Edge Function with a server-held secret and an exact authenticated `user_id` filter.
- Responses are `private, no-store`; provider and entitlement failures fail closed.
- No production deployment, migration, secret update, webhook change or branch merge was performed.

## Verification

- `node --check` passed for the new endpoint, dashboard module, updated auth module and preview server.
- 139 M34–M38 regression tests passed with zero failures after the M38-A navigation refinement.
- Browser visual QA passed at 1440×1000 and 390×844. Both widths had no document-level horizontal overflow, and the navigation remains a non-scrolling vertical list.
- Preview evidence:
  - `artifacts/m38/my-gpir-empty-state-desktop.png`
  - `artifacts/m38/my-gpir-empty-state-mobile.png`
  - `artifacts/m38/my-gpir-empty-state-preview.html`
  - `artifacts/m38/my-gpir-navigation-desktop.png`
  - `artifacts/m38/my-gpir-navigation-mobile.png`

## M38-A navigation refinement

The account navigation is presented as five vertically stacked, full-width route boxes above the dashboard summary. Each route has a restrained line icon, regular-weight Arial label, short description and chevron. The active route uses `aria-current="page"`, a soft navy tint and a narrow gold indicator; its state follows the current section hash without changing account or entitlement behaviour. Horizontal navigation scrolling has been removed at desktop and mobile widths.

## Controlled release recommendation

Hold production. In an approved non-production release, deploy only `gpir-reader-summary` with the established Supabase public/server credentials and allowed-origin configuration, then verify the dashboard with an authenticated reader. Production promotion should follow a separate approval after authenticated integration, empty-state and entitlement-backed library checks pass in that environment.

## M38-B controlled Sandbox release — 2026-10-11

- Linked and deployed target: `hoewtptllwkcqrgryazu` (`GPIR-M35-RUNTIME-TEST`). The excluded production reference was not accessed.
- Added the public `GPIR_ALLOWED_ORIGINS` configuration for `https://fintechoisis.com` and deployed only `gpir-reader-summary`.
- Remote function state: `ACTIVE`, version 1, JWT verification enabled.
- Live boundary checks passed: anonymous GET returned `401 SESSION_REQUIRED`; malformed bearer returned `401`; approved-origin preflight returned `204`; unapproved-origin preflight returned `403 ORIGIN_NOT_ALLOWED`.
- The three PayPal functions retained their function IDs, deployment hashes, update timestamps and JWT settings. Supabase advanced their displayed runtime version from 2 to 3 when the project-wide Edge Function secret set changed; no PayPal source or PayPal function deployment was performed.
- Local security/regression suite remained 139/139 PASS. It verifies that `resolve_publication_entitlement` is authoritative and that `gpir:paypal-sandbox-captured` can only request a server-summary refresh.
- Responsive acceptance passed at 1440×1000 and 390×844 with five vertical navigation boxes, correct active states and no horizontal navigation overflow.
- Evidence:
  - Authenticated Sandbox screenshots were retained locally and excluded from Git because they contain reader-specific test data.

Sandbox acceptance is **HOLD** pending one owner-supplied Sandbox reader sign-in made available through secure local environment variables or an existing reusable Sandbox session. No credential was available locally, so the signed-in Overview/Profile/Library/Payments/Plan empty-state test and a live two-reader isolation check were not claimed. No test reader was created because that would mutate Sandbox Auth state outside this release's no-database-change boundary.

## Consolidated M37/M38 Sandbox completion — 2026-10-11

The prior M38-B hold is resolved. The existing Sandbox reader was authenticated with a one-time admin link held only in process memory; no reader credential or server key was written to the repository, browser source or logs.

- `gpir-reader-summary` no longer reads `gpir_publication_access_policies` or `gpir_user_access_profiles` directly. Those canonical M34 tables intentionally deny direct `service_role` reads. Candidate publications come from the active Sandbox offer and the current reader's purchase entitlements, and every candidate is still decided by `resolve_publication_entitlement(text,text)`.
- The repaired function was the only function deployed. It is `ACTIVE`, version 7, JWT verification enabled, with deployment hash `f7cf66de3e5674d5584ea5903976f6be709da1cc123f4b9a2ca5a3c051a8d366`.
- Authenticated smoke testing returned `200` and the dashboard displayed the verified reader, no library entitlement, no active purchase, no subscription billing, and the USD 1.00 PayPal order in `CREATED` state. A supplied `user_id` query parameter could not change the reader-scoped response.
- Anonymous, malformed-token and unapproved-origin requests remained denied. The browser event `gpir:paypal-sandbox-captured` remains refresh-only and cannot grant access.
- All five section active states passed. Desktop (1440×1000) and mobile (390×844) had no horizontal overflow, retained five full-width vertical navigation boxes and contained no malformed character encoding.
- Final authenticated evidence was retained locally and excluded from Git because it contains reader-specific test data.

The three PayPal functions were not redeployed or modified. Their deployment hashes remain:

- create order: `55b28dc56ad32d4827ca17085853138bfc236bd65038e07fcb224a065ea532ed`
- capture order: `fec563164e04500faebe88a0c93ef27abff565014d0e45ed1e22ba4819f3fb58`
- webhook: `9989e20c127b258cb05b2214ea6a211137c630e861726947e22aea38ee8a9885`

M38 Sandbox acceptance is **PASS**. Production promotion remains **HOLD** pending separate approval. The unfinished PayPal buyer/capture lifecycle is tracked separately in `M37-M38-SANDBOX-COMPLETION.md`.
