# GPIR Payload CMS

This is a separate private Next.js/Payload application. It does not own or
replace the static GPIR routes. Payload is the editorial authority for migrated
research records; Supabase remains authoritative for identities, access policy,
intelligence records, authentication and entitlements. Public route changes are
produced only by the signed release endpoint and the owner-reviewed GitHub PR
workflow.

## Local/cloud setup

1. Use Node `>=24.22.1` and copy `.env.example` to `.env` without committing it.
2. Apply `supabase/migrations/20261114020220_gpir_payload_schema_isolation.sql`
   to an approved non-production database.
3. Provision separate login credentials out of band:
   - migration login inherits `gpir_payload_migrator` only;
   - runtime login inherits `gpir_payload_runtime` only.
4. Run `npm ci` and `npm run cloud:preflight`.
5. With the migration login in `PAYLOAD_DATABASE_URI`, generate and review the
   initial Payload collection migration with
   `npm run migrate:create -- initial_gpir_editorial_schema`. Commit it, run it
   on non-production, then switch to the runtime login for `npm run dev`.

Automatic Drizzle schema pushes are disabled in every environment. The app does
not run migrations on startup.

## Contentful migration

```text
npm run contentful:export -- --output=../../.migration-data/contentful/<stamp>
npm run contentful:import -- --backup=../../.migration-data/contentful/<stamp>
npm run contentful:reconcile -- --backup=../../.migration-data/contentful/<stamp>
```

The export directory is Git-ignored and written with restrictive file modes.
The importer checkpoints every media object and both import passes. Pass one
creates media, independent reference records and identity-safe drafts. Pass two
resolves relationships and Rich Text embedded links. A repeat is idempotent;
any competing GPIR, Contentful, Supabase or canonical-route identity fails the
run instead of creating a duplicate.

## Release

Payload users with role `release-service` use API keys only from the server-side
workflow. `POST /api/release/research-publications`:

- reads only editorially published, `PASS` records;
- calls `gpir_publication_release_decision` in Supabase for every record;
- emits the legacy-compatible publication input and release-decision files;
- signs the entire bundle with HMAC-SHA256; and
- appends an immutable release event.

The workflow then reuses the existing renderer, FX bridge and non-overwriting
route staging. It can only create a pull request. Merge and deployment stay
owner-controlled.
