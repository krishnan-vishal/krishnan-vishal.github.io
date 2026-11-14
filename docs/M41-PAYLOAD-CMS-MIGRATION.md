# M41 — Payload CMS migration and cloud development handover

## Decision and authority map

| Surface | Authority | Mutation path |
|---|---|---|
| Research editorial records, drafts and versions | Payload | authenticated editor/reviewer roles |
| GPIR publication and lineage identifiers | Supabase `gpir_identity_*` | existing service-role-only resolver |
| Access classes and reader decisions | Supabase | existing release and entitlement RPCs |
| Intelligence, evidence and Global Alerts | Supabase and existing deterministic jobs | unchanged |
| Public static routes | reviewed GitHub main / existing deployment | signed Payload bundle -> staged PR -> owner merge |
| Media binaries | Supabase Storage S3 endpoint | Payload server credentials, private bucket |

Payload never receives `anon`, `authenticated`, `service_role`, public-schema
or production route-write authority. The database adapter uses schema `payload`,
`push: false`, UUID identifiers and a dedicated runtime/migrator role split.

## Repository integration result

- The current public site remains the static application deployed through the
  existing GitHub/Cloudflare route. `wrangler.jsonc`, `routes.json`, `CNAME`,
  public HTML and existing Supabase Edge Functions are not replaced.
- The Contentful delivery build currently creates a non-deploying artifact,
  checks Supabase release decisions, renders protected route shells, preserves
  existing routes and proposes a PR. The Payload release workflow deliberately
  reuses that same renderer/staging boundary.
- ASK GPIR continues to consume the existing search/history APIs. FX keeps the
  existing editorial bridge. Smart Intelligence and My GPIR keep their existing
  Supabase APIs. No data contract or endpoint was changed for these consumers.
- Global Alerts eligibility thresholds, evidence gates, `ticker_eligible`, the
  original-source timestamp and the 12-hour LIVE-to-ARCHIVED presentation rule
  are untouched. Payload manages research publications, not alert eligibility.

## Content model mapping

The live repository contract for `gpirPublication` contains the following
fields and they are represented in `research-publications`: `gpirPublicationId`,
`publicationTitle`, `slug`, `publicationType`, `publicationStatus`, `region`,
`countryMarket`, `directionScope`, `useCasePaymentCategory`, `publicationDate`,
`dataCutOffDate`, `executiveSummary`, `editorialBody`, `dashboardAsset`,
`sourceValidationSummary`, `legacySourceUrl`, `canonicalUrlCandidate`,
`editionLineageId`, `editionLabel`, `supabaseRecordId`, `migrationStatus` and
`validationStatus`.

Separate collections hold chapters, countries, regions, editorial metadata and
media. Source records and hashes remain attached for audit. Contentful entry and
asset IDs are unique. GPIR publication ID, Supabase record ID and canonical path
are also unique and immutable after assignment. Versions/drafts are enabled;
only reviewers can mark a validation result or approve a Payload version.

## Migration sequence

1. Run the manual backup workflow or local exporter with an organization-granted
   Contentful management token. It exports every content type, editor interface,
   locale, entry, asset, tag and media binary, recording SHA-256 hashes.
2. Preserve the ignored backup and its manifest. GitHub backup artifacts are
   environment-restricted, encrypted by GitHub at rest and retained for seven
   days; long-term retention must use an owner-approved secure store.
3. Apply the schema-isolation migration to a non-production Supabase project and
   generate/review the initial Payload migration there. Never generate or push
   schema directly against production.
4. Run pass one: media and independent records first, then identity-safe Payload
   drafts. Supabase supplies the authoritative access class.
5. Run pass two: resolve countries, regions, chapters, dashboard assets and every
   embedded Rich Text asset/entry. Any unresolved reference stops before its
   checkpoint advances.
6. Run reconciliation. Counts, four identity namespaces, mapping equality and
   `RECONCILED` state must all pass.

## Release and bypass prevention

Payload collection REST/GraphQL reads are not public. An editor cannot publish
to GPIR by toggling Payload `_status`. The release-service API key can read only
published/PASS records and cannot edit them. The release endpoint obtains a
fresh Supabase decision for each `(gpirPublicationId, supabaseRecordId)` pair,
includes withheld decisions in the report, signs the full bundle and writes an
append-only event. The GitHub workflow is manual-only and refuses RELEASE or
ARCHIVE unless the protected `PAYLOAD_RELEASE_CUTOVER_ENABLED` variable is
`true`; even then it only proposes a PR and never overwrites an existing route.

## Acceptance and cutover gates

Before the delivery source can switch from Contentful to Payload, all of the
following require owner authorization and recorded evidence:

- a valid Contentful backup manifest and separately secured backup;
- reviewed initial Payload DDL migration applied to non-production;
- non-production import and reconciliation PASS with no duplicate identity;
- create, draft, review, update, release, retrieve and archive acceptance through
  the Payload API and existing protected reader flow;
- ASK GPIR, FX, Smart Intelligence, My GPIR and public/subscriber access checks;
- focused Global Alerts threshold and 12-hour expiry tests unchanged;
- owner-reviewed release PR, rollback rehearsal and rollback-window duration;
- protected cutover variable enabled only for the approved run.

Contentful retirement is a separate destructive action. It is not performed by
these workflows and requires owner authorization after the rollback window.

## Current blockers (2026-11-14)

- The available Contentful management token returned
  `OrganizationAccessGrantRequired`; no live export was created.
- No approved Payload database login, Supabase Storage S3 keys, Payload secret or
  release-service API key is available. No schema or content was written.
- The initial generated Payload collection migration requires the approved
  non-production database. The checked-in isolation migration is ready, while
  `src/migrations/index.ts` intentionally remains empty and fails closed.
- The local host is Node 24.21.0; Payload 3.93.0 requires Node 24.22.1+ (or
  22.23.4+). The dev container is configured for the supported line.
- `npm audit --omit=dev` has no critical advisory after upgrading Next to 16.4.6
  and DOMPurify to 3.4.17. Three high advisories remain in Payload Lexical's
  transitive `happy-dom@20.14.6`; the patched `21.0.4` is outside the upstream
  declared range and was not forced.

The next executable action is to grant a Contentful organization-scoped
management token and provision an approved non-production database login. Then
run export, create/review the initial Payload migration, import and reconcile.
