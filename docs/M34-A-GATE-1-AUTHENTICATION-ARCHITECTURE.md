# M34-A Gate 1 — Authentication and Subscriber Access Architecture

## Milestone identity

- **Owner:** Vishal Krishnan
- **Date:** 2026-09-18
- **Classification:** ARCHITECTURE, SECURITY, GOVERNANCE, READER EXPERIENCE
- **Working branch:** `work/m34-a-gpir-authentication-layer`
- **Approved base:** `origin/main`
- **Base / starting SHA:** `e516fe4304b468445f1dfc67e6c1568eb08b1932`
- **Gate 1 milestone SHA:** `d523a63f891aa630541e256ea549458d1861acaa`
- **Ending branch SHA:** the later control checkpoint that records the milestone
  SHA is reported by the final Git handoff
- **Status:** GATE 1 DESIGN COMPLETE; GATE 2 REQUIRES OWNER APPROVAL

This is a read-only discovery and implementation-planning milestone. It creates
no account, route, migration, function, secret, CAPTCHA, entitlement, protected
content, deployment or production change.

## 1. Governance and isolation

Reviewed controls:

- `AGENTS.md`
- `docs/DEVELOPMENT_GOVERNANCE.md`
- `docs/ARCHITECTURE_GUARDRAIL.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STATUS.md`
- `docs/GPIR_BACKLOG.md`
- `docs/MASTER_PROJECT_LOG.md`
- `SECURITY.md`

The branch was created from the exact approved `origin/main` SHA after a clean
working-tree check and a remote fetch. Its merge base with the M33 work branch
is the approved main SHA, not the M33 tip. No M33 commit, migration, function,
scheduler artifact, document or test is present in or copied to this branch.

## 2. Current architecture findings

### Delivery and build

- GPIR is a GitHub Pages static site at `https://fintechoisis.com/` using
  hand-authored/generated HTML, shared CSS, vanilla browser JavaScript and JSON.
- Approved main has no package manifest, application bundler, server runtime,
  framework router, service worker, authentication route or protected build.
- The repository contains 102 HTML pages under `pages/`, 19 shared JavaScript
  files under `assets/js/` and four GitHub Actions workflows.
- `site.webmanifest` provides install metadata, but no `sw.js`,
  `service-worker.js` or `navigator.serviceWorker` registration exists.
- Existing URLs are physical `.html` files. M34 routes should use directory
  `index.html` files so GitHub Pages can serve stable trailing-slash URLs without
  a client router or 404 rewrite.

### Supabase boundary

- Existing browser modules read announcement/FX data with a public Supabase
  publishable/anonymous key. Existing Actions jobs use repository secrets for
  narrowly scoped server-side writes. A public key is not a secret; its safety
  depends entirely on correct RLS.
- Approved main has no Supabase Auth integration, version-controlled migrations,
  Auth callback, profile/role schema, MFA flow or authentication test fixture.
- Approved main has no `supabase/functions/` tree. M34 must create only new,
  M34-named functions and must not import or alter M33's intelligence function.
- `assets/js/supabase-combined-engine.js`, loaded by the homepage and intelligence
  index, constructs markup from database fields with `innerHTML`. That is an XSS
  exposure that must be removed or isolated before same-origin authentication
  sessions are activated. Gate 1 does not repair it.

### Public-content and protected-content boundary

- All tracked GitHub Pages HTML, JSON, JavaScript, images, PDFs and generated
  indexes are public artifacts. Hiding a link, checking a role in JavaScript or
  adding `robots.txt` rules cannot protect them.
- `assets/data/search-index.json`, canonical JSON, generated intelligence pages,
  dashboards and publications are currently public and may remain so only when
  classified `public`.
- Registered-only bodies, private PDFs and entitlement metadata must never be
  committed to the public Pages artifact, sitemap, search index, precache or
  public fallback data. They must be fetched after authorization from a private
  Supabase table or private Storage bucket with database-enforced policy.

### Security, navigation and accessibility

- GitHub Pages does not provide repository-controlled response headers such as
  Content-Security-Policy, `frame-ancestors`, X-Frame-Options,
  Permissions-Policy or Referrer-Policy. A meta CSP can reduce some browser risk
  but is not equivalent to response headers and cannot supply every directive.
- The current site includes inline scripts and extensive dynamic HTML, so a
  strict site-wide CSP requires deliberate remediation before auth activation.
- Existing navigation and dialogs provide useful patterns: mobile menus expose
  `aria-expanded`, search uses `role=dialog`/`aria-modal`, Escape closes panels,
  focus is restored, and reduced-motion styles are widespread. A complete focus
  trap is not consistently established and must be explicit in auth dialogs.
- Current browser storage is limited by policy to interface preferences. No
  session-storage contract, account data or auth token lifecycle exists.

### Search, publication and workflows

- Search loads a generated static index in the browser and adds static dashboard
  and announcement records. Protected records cannot enter any of those inputs.
- Publication and M33 intelligence are separate systems. Authentication must not
  create a second publication path or write to announcement/intelligence tables.
- Security CI runs dependency-free Node validators, link checks, JavaScript
  syntax and a high-confidence secret scan. M34 should extend that gate with
  auth-specific static and migration tests; it must not weaken existing checks.

### Legal notices

- The Privacy Policy currently states that the live site has no visitor
  accounts, authentication, password collection or site-level personal-data
  collection.
- The Cookie Policy says the current site intentionally sets no HTTP cookies and
  uses local storage only for language/display preferences.
- Terms anticipate possible accounts, but the privacy/cookie current-state
  statements must be updated before any public registration is activated.

## 3. Access model

Initial access levels are:

| Level | Meaning | Assignment |
| --- | --- | --- |
| `public` | Anonymous access to the current reviewed static corpus | Implicit; no user row required |
| `registered_reader` | Verified account with completed consent and TOTP-backed AAL2 | Granted only by a controlled onboarding function after all gates pass |
| `owner` | Repository/platform administration | Bootstrapped only to the owner's confirmed `auth.users.id` UUID |

Role names are data, not PostgreSQL/Supabase database roles. The authorization
model must keep a separate entitlement catalog so later `subscriber` or
`premium` grants can be added without changing the initial role semantics.
No price, payment, checkout, billing or paid subscription object belongs to
M34-A.

## 4. Visitor and authentication journey

```text
public visitor
  -> 150 seconds of active foreground browsing
  -> optional accessible invitation
  -> sign up or sign in
  -> email verification
  -> profile + mandatory policy consent; marketing remains optional/off
  -> TOTP enrollment and challenge
  -> AAL2 session
  -> registered_reader authorization
  -> registered-only content fetched from protected storage
  -> future entitlement boundary (not implemented in M34-A)
```

### Exact route design

| Route | Purpose |
| --- | --- |
| `/auth/sign-up/` | Email/password registration and mandatory policy acknowledgements |
| `/auth/sign-in/` | Email/password sign-in; no Phone Auth |
| `/auth/confirm/` | Email OTP/token-hash verification landing route |
| `/auth/callback/` | PKCE code exchange and safe allowlisted continuation |
| `/auth/recovery/` | Initiate password recovery |
| `/auth/update-password/` | Recovery-session password replacement; never bypasses MFA |
| `/auth/mfa/enroll/` | One-time TOTP enrollment and QR/secret display |
| `/auth/mfa/challenge/` | TOTP challenge required to obtain AAL2 |
| `/account/` | Profile, session and security summary |
| `/account/privacy/` | Consent history and privacy/export/deletion requests |
| `/registered/` | Registered-reader landing shell; contains no protected payload at build time |

Every route is a physical directory `index.html`. Auth/account/registered routes
are `noindex,nofollow` and excluded from the public sitemap. `robots.txt` may
reduce discovery but is never treated as authorization.

### Redirect URLs for later owner configuration

Production allowlist:

- `https://fintechoisis.com/auth/callback/`
- `https://fintechoisis.com/auth/confirm/`
- `https://fintechoisis.com/auth/update-password/`

The Supabase Site URL should remain `https://fintechoisis.com/`. Development
redirects must be explicit exact localhost origins/ports chosen for the future
test harness; wildcards and arbitrary `next` URLs are prohibited. The GitHub
repository hostname should be allowed only if the owner intentionally uses it
as a deployed test origin. Callback code accepts only same-origin paths from a
small constant allowlist and defaults to `/registered/`.

### Signup, confirmation, sign-in and recovery

1. Signup accepts email/password and current Terms/Privacy acknowledgement.
   Marketing consent is a separate unchecked control and never a condition of
   service. Optional phone is collected only in the later encrypted-contact
   step, never in signup metadata.
2. Supabase sends verification through its approved email channel. Until
   `email_confirmed_at` is present, no registered-reader grant is usable.
3. The confirmation route verifies the token and sends the reader to TOTP
   enrollment. The callback route exchanges a PKCE code once, removes sensitive
   parameters from browser history and validates the continuation path.
4. Sign-in creates only an AAL1 session first. Registered content and private
   profile operations remain blocked until a verified TOTP challenge yields
   `aal2`.
5. Recovery email ends at `/auth/update-password/`. Password replacement does
   not remove a factor or grant registered access. A lost factor requires an
   owner-controlled, audited recovery procedure; email alone does not bypass it.

## 5. TOTP and session policy

- Supabase TOTP is the only proposed second factor. Phone Auth and Phone MFA
  remain disabled.
- Enrollment uses `mfa.enroll({ factorType: "totp" })`; the QR/secret is shown
  transiently once and never logged, persisted or placed in analytics.
- Challenge/verification must produce an AAL2 JWT. Frontend route guards improve
  UX, but protected-table and Storage policies enforce AAL2 independently using
  the JWT assurance-level claim.
- A session at AAL1 may read only its minimal onboarding state. It cannot read
  registered content, private contacts, privacy exports or owner controls.
- Static hosting cannot issue first-party HttpOnly session cookies. Before
  activation the owner must approve either a hardened browser-session strategy
  after site-wide XSS remediation or an isolated auth origin/hosting layer with
  proper response headers. Default long-lived local-storage tokens must not be
  introduced silently.
- Sign-out clears the Supabase session and all M34 transient session state.

## 6. Delayed invitation design

- Count exactly 150 seconds only while `document.visibilityState === "visible"`
  and the window has focus. Pause on blur, hidden state and page freeze.
- Do not show until the initial auth-state check resolves. Never show to an
  authenticated user, auth/account route, kiosk session or user with an open
  modal.
- Dismissal stores only a versioned expiry timestamp, for example
  `{ version: 1, dismissedUntil: <epoch> }`, under an M34-specific local-storage
  key. It contains no user identifier, email, source route or behavioral history
  and expires after seven days.
- The invitation is an accessible dialog with a labelled heading, initial focus,
  focus containment, Escape dismissal, background inertness, focus restoration
  and keyboard-equivalent actions. Reduced-motion users receive no entrance or
  exit animation.
- The invitation never blocks reading, never dark-patterns marketing consent and
  never initiates network collection merely by appearing.

## 7. Data model

| Object | Purpose and key controls |
| --- | --- |
| `public.profiles` | One row per `auth.users.id`; minimal display/onboarding fields only; no phone, role or marketing flag |
| `public.access_roles` | Seeded role catalog: `public`, `registered_reader`, `owner`; later roles append without replacement |
| `public.user_roles` | Audited user-to-role grants; no client self-assignment |
| `public.entitlement_catalog` | Future capability identifiers; no paid product or price data |
| `public.user_entitlements` | Future audited grant boundary; empty for M34-A except owner-approved capability grants |
| `public.consent_documents` | Immutable Terms/Privacy/marketing document version and digest records |
| `public.consent_events` | Append-only accept/withdraw events; current state is derived, never overwritten |
| `public.privacy_requests` | Access/export/correction/restriction/objection/deletion request workflow |
| `public.protected_content_catalog` | Metadata and required capability; never stores a public payload URL |
| `private.user_private_contacts` | Optional encrypted phone ciphertext, nonce, algorithm/key version and masked presentation only |
| `private.security_audit_events` | Append-only security/owner/privacy events with redacted structured metadata |

`profiles.user_id`, role grants and all ownership relationships use UUID foreign
keys to `auth.users(id)`. Email is not copied into profile/role tables. Public
role is implicit for anonymous readers. Registered-reader completion is an
idempotent `SECURITY DEFINER` function with a fixed search path that checks the
verified user, current mandatory consent versions and AAL2 before granting the
role. It grants no owner role.

### Owner bootstrap

The owner supplies and confirms the exact production `auth.users.id` UUID during
a separately authorized Supabase milestone. A single transaction inserts the
owner grant for that UUID and fails if the user does not exist or is unverified.
No email comparison, domain rule, JWT email claim or repository placeholder may
grant owner access. Rotation/revocation is separately audited and owner-only.

## 8. RLS policy matrix

All exposed tables enable and force RLS. Tables have no broad write grant.
`service_role` is confined to reviewed Edge/administrative paths and never enters
browser code.

| Object/action | Anonymous | AAL1 authenticated | AAL2 registered reader | AAL2 owner |
| --- | --- | --- | --- | --- |
| Public static content | Read | Read | Read | Read |
| Active consent-document versions | Read | Read | Read | Read |
| Own profile | None | Read/update allowlisted profile fields | Same | Same plus audited administration |
| User roles/entitlements | None | Read own | Read own | Read/administer through controlled function |
| Consent events | None | Append/read own | Append/read own | Audited read; no historical rewrite |
| Privacy requests | None | Create/read own | Create/read own | Update workflow status and fulfil |
| Protected content | None | None | Read when active role/entitlement and `aal2` | Read |
| Private phone table | None | None | No direct access | No general plaintext access |
| Security audit events | None | None | None | Read redacted events only |

Policy predicates require all applicable conditions: `auth.uid()` matches the
subject, email is verified, JWT AAL is `aal2`, the role/grant is active and the
content requirement is satisfied. Owner checks resolve the exact UUID-backed
role through a hardened helper. Client-supplied role, email, profile metadata or
route state is never authorization evidence.

## 9. Optional phone protection

- Phone is optional and is not part of Supabase Phone Auth or Phone MFA.
- The browser validates a plausible international number only for usability,
  then sends it directly over HTTPS to an authenticated AAL2 M34 Edge Function.
  It is never placed in user metadata, `public.profiles`, query strings,
  analytics, logs or browser storage.
- The function revalidates and normalizes E.164, encrypts with authenticated
  encryption using a protected server-side key, and stores ciphertext, nonce,
  algorithm/key version plus a presentation mask. The secret is configured only
  in a later owner-authorized deployment and never committed.
- The function suppresses request-body logging and returns only a mask such as
  `+•• •••• 1234`. General-purpose decryption, bulk export and promotional use
  are prohibited. Removal deletes the ciphertext through an audited AAL2 action.
- If encryption/key-management and log-redaction behavior cannot be proven,
  optional phone collection remains disabled without blocking accounts.

## 10. Proposed Edge Functions

| Function | Proposed responsibility | Explicit exclusions |
| --- | --- | --- |
| `m34-private-contact` | AAL2 upsert/remove of optional encrypted phone; masked response | No general decrypt, listing, marketing or bulk export |
| `m34-privacy-request` | Create authenticated export/deletion/correction request and audit event | No automatic destructive deletion and no email/SMS provider |
| `m34-content-access` | Optional entitlement/AAL2 check before issuing a short-lived private-content response or signed URL | No public payload, publication write or M33 call |

Database RLS remains authoritative even when an Edge Function performs the
operation. None of these functions exists or is deployed in Gate 1.

## 11. Protected-content strategy

1. Assign every artifact an explicit `public` or protected classification.
2. Keep public records in the existing static generation path.
3. Store protected bodies/files only in an RLS-protected table or private
   Storage bucket; keep only a non-sensitive shell in the public repository.
4. Fetch after verified AAL2 and entitlement checks. Treat signed URLs as short-
   lived bearer capabilities and never place them in generated HTML or indexes.
5. Extend generation/validation so protected IDs, titles requiring secrecy,
   bodies, private paths and signed URLs cannot enter `pages/`, `assets/data/`,
   sitemap, search index, GitHub Actions artifacts or static fallbacks.
6. Accept that an authorized reader can save or share displayed material; the
   design provides access control, not DRM.

## 12. Turnstile integration plan

- Prepare an adapter at signup, sign-in, recovery and other abuse-sensitive
  submissions, but leave it disabled behind a false configuration flag.
- When separately authorized, render Turnstile only at the form interaction,
  obtain a single-use token and pass it through Supabase Auth's supported CAPTCHA
  option. The secret stays in Supabase configuration; only the site key is public.
- Provide accessible error/status text and a retry that does not discard form
  fields. Do not treat CAPTCHA as MFA or authorization.
- Gate 1 creates no key, secret, widget, dashboard setting or production rule.

## 13. Privacy, consent and retention

- Mandatory Terms and Privacy acknowledgement records exact immutable document
  versions. Marketing consent is separate, optional, unticked and withdrawable.
- A consent change appends an event; it never rewrites the prior event.
- Privacy requests are user-visible workflow records with received, verifying,
  in-progress, completed/rejected and completion timestamps. Export payloads are
  generated only after identity/AAL2 verification and delivered through a short-
  lived protected channel.
- Account deletion is a reviewed workflow: revoke sessions/access first, retain
  only legally required audit/consent evidence, delete/anonymize other profile
  and private-contact data, and record the completion without retaining the
  deleted payload.
- Proposed retention values must be configuration-backed and receive owner/legal
  approval before activation. Gate 2 should test expiry behavior but must not
  assert a jurisdiction-wide legal period without that approval.
- No promotional communication, bulk phone export, paid email, SMS or WhatsApp
  provider is introduced.

The Privacy Policy, Cookie Policy and any account-facing notice must be updated
and reviewed before live registration because their current-state statements
accurately say that accounts and authentication do not exist today.

## 14. Kiosk sessions

- Kiosk mode is public-only by default: no invitation, signup, sign-in, recovery,
  profile or protected-content route is offered.
- If authenticated kiosk access is ever separately approved, use
  `persistSession:false`, memory-only tokens, short inactivity timeout, explicit
  sign-out/clear and a visible shared-device warning. Never retain email, phone,
  consent form values or refresh tokens.
- Query-string kiosk flags are UI hints, not security controls. Deployment or
  managed-browser configuration must establish a trusted kiosk environment.

## 15. Proposed Gate 2 file-change manifest

No files below are implemented by Gate 1.

### Static routes and UI

- `auth/sign-up/index.html`
- `auth/sign-in/index.html`
- `auth/confirm/index.html`
- `auth/callback/index.html`
- `auth/recovery/index.html`
- `auth/update-password/index.html`
- `auth/mfa/enroll/index.html`
- `auth/mfa/challenge/index.html`
- `account/index.html`
- `account/privacy/index.html`
- `registered/index.html`
- `assets/css/auth.css`
- `assets/js/auth/client.js`
- `assets/js/auth/callback.js`
- `assets/js/auth/guards.js`
- `assets/js/auth/forms.js`
- `assets/js/auth/invitation.js`
- `assets/js/auth/profile.js`
- `assets/js/auth/privacy.js`
- `assets/data/auth-public-config.json` containing only approved public values

### Existing surfaces proposed for controlled change

- Navigation/footer templates and generated pages: add auth entry points only
  behind an inactive feature flag until activation approval.
- `pages/legal/privacy-policy.html`, `pages/legal/cookie-policy.html` and
  `pages/legal/terms-of-use.html`: reconcile actual account processing before
  activation, not during hidden design work.
- `assets/js/supabase-combined-engine.js`: remove unsafe database-to-`innerHTML`
  rendering or exclude it from every authenticated origin before session use.
- `sitemap.xml` and `robots.txt`: exclude auth/account/protected routes without
  representing crawler controls as security.
- `.github/workflows/security-integrity.yml`: add only deterministic M34 schema,
  RLS, route, protected-artifact and secret-boundary tests.

### Proposed validation files

- `scripts/validate-m34-auth-boundary.js`
- `scripts/test-m34-auth-routes.js`
- `scripts/test-m34-invitation.js`
- `scripts/test-m34-protected-artifacts.js`
- `tests/fixtures/m34-auth-policy-cases.json`

## 16. Proposed migration manifest

- `supabase/migrations/m34-a/001-auth-foundation.sql`
- `supabase/migrations/m34-a/002-consent-privacy-audit.sql`
- `supabase/migrations/m34-a/003-roles-entitlements.sql`
- `supabase/migrations/m34-a/004-rls-and-hardened-functions.sql`
- `supabase/migrations/m34-a/005-protected-content-boundary.sql`
- `supabase/migrations/m34-a/006-owner-bootstrap-template.sql`
- `supabase/migrations/m34-a/m34-a-isolated-regression.sql`
- `supabase/migrations/m34-a/m34-a-disable-and-rollback.sql`

Migrations must be additive, transactional and idempotent where practical;
qualify application objects, fix `search_path` on definer functions, revoke
default/public privileges, preserve audit/consent history on rollback, and run
against isolated PostgreSQL/Supabase before any owner production decision.
The owner bootstrap template fails closed until a confirmed UUID is supplied.

## 17. Test matrix

| Area | Required proof before activation |
| --- | --- |
| Routes | Direct load, refresh, back/forward and invalid-token states for every physical route |
| Signup/confirmation | Duplicate account, weak password, expired token, replay, wrong redirect and verified-email behavior |
| Sign-in/recovery | Generic anti-enumeration messages, rate-limit state, recovery replay and no MFA bypass |
| TOTP/AAL2 | Enrollment, challenge, incorrect/expired code, new session, factor loss and AAL1 denial |
| RLS | Anonymous/AAL1/AAL2 reader/owner matrix for every select/insert/update/delete path |
| Owner | Exact UUID bootstrap, wrong UUID failure and no email/domain elevation |
| Content | Protected payload absent from Git tree, Pages output, sitemap, search, fallback and CI artifacts |
| Phone | International normalization, ciphertext-only storage, masking, log redaction, key version and no decrypt/list endpoint |
| Consent/privacy | Separate unchecked marketing, immutable versions, withdrawal, export/delete workflow and retention expiry |
| Invitation | 150 active seconds, hidden/blur pause, seven-day suppression, authenticated/kiosk exclusion |
| Accessibility | Keyboard-only, focus trap/restore, announcements, errors, zoom, contrast and reduced motion |
| Responsive | Representative mobile, tablet and desktop widths; portrait/landscape and virtual keyboard |
| Security | XSS sinks, open redirect, PKCE/state replay, CSP compatibility, secret scan and dependency review |
| Rollback | Disable invitation/routes first, revoke grants/functions, preserve evidence and restore public LKG site |

Mobile minimums include 320/375/390 px; tablet includes 768/1024 px; desktop
includes 1280/1440 px. Tests cover current Chromium, Firefox and WebKit/Safari
equivalents where the approved test environment supports them.

## 18. Owner-only Supabase actions

All remain unexecuted and require separate approval:

1. Confirm the target Supabase project and its separation from M33 operations.
2. Review/apply migrations after isolated proof and read-only production preflight.
3. Confirm the owner's exact verified `auth.users.id` UUID and run bootstrap.
4. Configure exact Site URL and redirect allowlist.
5. Review email templates, sender/deliverability limits and password/rate-limit
   settings without adding an unapproved paid provider.
6. Enable TOTP only after route/RLS tests pass; keep Phone Auth and Phone MFA off.
7. Configure optional phone encryption secret only if phone storage is approved.
8. Deploy M34 Edge Functions after code/security review.
9. Configure Turnstile only in a later explicit activation step.
10. Activate public registration only after legal, security, accessibility,
    rollback and monitoring evidence is approved.

## 19. Risks, blockers and stop conditions

Gate 2 implementation may begin only after owner review of this report. Public
activation must stop on any of the following:

- unclear or unconfirmed owner UUID;
- auth schema/RLS mismatch or any anonymous/AAL1 protected read;
- protected payload present in a public artifact;
- unresolved database-to-HTML XSS or unsafe same-origin script path;
- unapproved session persistence on static hosting;
- callback/open-redirect, PKCE or token-history failure;
- unavailable TOTP/AAL2 enforcement in both frontend and RLS;
- phone plaintext in a profile, metadata, log, browser store or bundle;
- privacy/cookie notices still describing the pre-account implementation;
- inability to disable signup/routes/functions without deleting evidence;
- any need to modify M33, production data, DNS, CAPTCHA, secrets or payment
  systems outside a separately approved milestone.

## 20. Rollback and activation sequence

1. Build and test migrations, routes and functions only in an isolated project.
2. Keep navigation invitation and public signup feature flags off.
3. Prove RLS/AAL2, protected-artifact exclusion, callback handling and rollback.
4. Owner reviews legal notices, UUID bootstrap, redirects and session/header risk.
5. Apply production schema/functions in a separately approved maintenance step
   while public registration remains disabled.
6. Run read-only/post-deployment verification and one owner test account.
7. Activate invitation/signup only after every gate passes.
8. On failure, disable invitation/signup and auth route entry points, revoke
   M34 function grants/sessions as appropriate, preserve consent/audit evidence,
   and leave the existing public static site as last-known-good.

## 21. Validation evidence

The documentation-only Gate 1 change passed:

- content validation: 15 announcements, 14 candidates, 6 countries, 113 trusted
  sources and 57 registry records;
- internal-link validation: 104 HTML files;
- announcement validation: 15 records, 14 published/registry/intelligence/page
  records;
- announcement-intent validation: 11 checks plus ASK GPIR scenarios A–M;
- production-announcement pipeline: 29 checks;
- `git diff --check`;
- changed-JavaScript syntax check (no JavaScript changed); and
- the repository's high-confidence secret-pattern scan (no match).

The advisory performance audit completed with four pre-existing warnings: one
image missing dimensions, two pairs of byte-identical logo assets and the
documented world-map script scope observation. Gate 1 added no performance
artifact and did not alter those files.

## Recommendation

**Gate 2 may begin only as an isolated implementation-and-test milestone after
explicit owner approval.** It must remain non-production and feature-flagged.
Public activation is not recommended until XSS/session/header strategy, legal
notices, owner UUID, RLS/AAL2 and protected-artifact tests are resolved.
