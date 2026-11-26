# GPIR Drive editorial import

The manual GitHub Actions workflow uses the existing `payload-production-cutover`
environment and shares the production release concurrency group. It reads the 92
previously inventoried Drive files by ID. Keep the inventory in the environment
secret `GPIR_DRIVE_INTAKE_MANIFEST` because it contains private Drive identifiers.
No Drive list or write permission is needed. The OAuth principal must be able to
read each inventoried file.

Use the same secret references as the existing CMS configuration for the Payload
database and media bucket. The runner requires `PAYLOAD_DATABASE_URI`,
`PAYLOAD_SECRET`, the configured S3 endpoint, bucket, region and credentials, and
`PAYLOAD_DATABASE_CA_CERT` when the production certificate chain requires it.
Contentful is read through the existing management credential and environment ID.
Check that these references resolve in the existing protected GitHub environment
before the first dispatch.

Each inventory row has `id`, `size` and `mime`. Add an `editorial` object to rows
with existing governed identities and verified editorial material. The object
contains `publicationId`, `lineageId`, `recordId` (the Supabase UUID), `route`,
`title`, `summary`, `body`, `chapterSlug` and `category`. Optional scope fields
are `region`, `country` and `direction`. Use the existing chapter slug for the
approved GPIR category. Preserve the source publication identity and approved
text. The importer creates a native draft and attaches the original image or PDF.
Unmapped material and unsupported formats, including Word documents, are held
after exact-byte reconciliation. The run summary separates exact-byte duplicates,
existing identities, held items and created drafts.

Run **GPIR Drive editorial import** on main after review and merge. Repeat the
same dispatch to resume an interrupted import. Drafts already created are skipped
and an intake media row left by an interrupted write is reused. The runner reads
the production inventories before writing and makes no changes to existing
publication records.

New drafts are WARN and ENTITLED. The existing reviewer and Supabase decision
must authorize release before `src/migration/prepare-site-release.ts` can include
approved records in a signed edition. Use the existing
`payload-publication-release.yml` workflow in RELEASE mode with the exact
prepared snapshot. Its publication review and Contentful synchronization remain
the release controls. Verify the live publication routes, Search and ASK GPIR
through the existing delivery path after Pages publishes the reviewed edition.
