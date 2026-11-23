# GPIR Domain Experts and Global Leaders

## Reader and editorial evidence

| Surface | Contract |
| --- | --- |
| Navigation | Repository → Directory → Domain Experts & Global Leaders on the homepage and Intelligence Observatory. The existing Industry Participants chapter remains linked. |
| Reader eligibility | The existing Supabase subscriber resolver checks the session, payment entitlement and confirmed GPIR admin access. Guest and unpaid responses contain no profile, facet or count. |
| Evidence | Each editorial identity is a private, versioned Payload Editorial Metadata record. A release requires documented identity, 10+ years of evidence, sourced career and executive brief, independently sourced contribution, recorded publication and sanctions review, explicit owner approval and a current review date. Optional qualifications and recognition use the same sourced-claim shape. |
| Distribution | An admin explicitly syncs the approved reader projection into GPIR Core. GPIR Core rejects stale and conflicting revisions. Archive sync withdraws the projection. The reader RPC stops returning expired releases even if no new sync occurs. |
| Accessibility | WCAG 2.2 AA design target. Skip navigation, labeled native controls, visible focus, expandable native sections, announced results, focus restoration and responsive reflow. Complete keyboard, screen-reader, contrast and zoom acceptance on a deployed preview. |
| Initial inventory | 13 distinct owner-brief candidates parsed in a dry run. No imported production records or published profiles verified. Candidate and editorial claims must be verified individually. Expansion toward 500 remains an editorial discovery and verification effort. |

## Validation recorded on the feature branch

The isolated GPIR-M35-RUNTIME-TEST PostgreSQL 17 check passed privilege separation, combined filters, projection redaction, pagination, expiry, idempotent sync, stale revision rejection and archive withdrawal. The temporary schema was rolled back and confirmed absent. The local browser runtime did not start, so rendered accessibility acceptance remains pending.

## Owner-reviewed rollout

1. Use the recorded isolated migration acceptance as the release baseline. Repeat it if migration SQL changes.
2. After approval, apply the Core migration, deploy the existing source-directory Edge Function with its new catalog option, and deploy the Payload editor and release endpoint via the existing pipelines. The Core connection uses the existing `GPIR_CORE_SUPABASE_URL` and `GPIR_CORE_SUPABASE_SECRET_KEY` configuration. Keep CMS and Core credentials server-side.
3. Run `python scripts/import-domain-expert-brief.py PATH_TO_APPROVED_BRIEF.docx` for a dry run. To stage the private REVIEW records, supply the approved Payload origin in `PAYLOAD_PUBLIC_SERVER_URL` and an editor session JWT in `GPIR_PAYLOAD_EDITOR_TOKEN`, then add `--stage`. Re-running the importer preserves previously reviewed records.
4. For each candidate, verify sources and clearance in Editorial Metadata. The Payload validation field contract is in `apps/gpir-cms/src/lib/domain-expert.mjs`. Document approval and sanctions screening scope. Set state to PUBLIC in Payload only after clearance. Call the admin-only `POST /api/release/domain-expert` with `{"id":"gpir-expert:<canonical suffix>"}`. To withdraw, set state to ARCHIVED and sync the same identity. Retain the Payload record and its version history. Only an explicit, successful sync changes reader delivery.
5. Verify guest, signed-in unpaid, subscriber and confirmed admin states on the deployed route. Test the site's existing menu on desktop and mobile. Check the empty state, pagination, a sourced card, visible focus and keyboard-only selection. Confirm that source directories and the Industry Participants chapter still work.
6. Review published identities at least annually and when their role, evidence or permissions change. Record dated corrections in Payload and resync. For release rollback, restore the prior frontend and Edge bundle through existing review gates. Archive and sync any projection that must be withdrawn.

The intended reader route is [Domain Experts & Global Leaders](https://fintechoisis.com/pages/intelligence/domain-experts.html). Treat it as a proposed route until the reviewed release is deployed.
