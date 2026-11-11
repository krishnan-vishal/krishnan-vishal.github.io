# M40 category-aligned publication and repository contract

- **CMS:** one governed editorial publication per approved category/topic edition, not one entry per incoming alert, historical observation, or source article.
- **Taxonomy:** publication categories must resolve to the existing GPIR menu header, subtitle, and approved topic keywords; retain source attribution and the canonical publication identity. Unmapped categories remain unpublished until governed.
- **Live alerts:** independently approved source announcements remain individual evidence records in the 12-hour relay; they are **not** automatically created as Contentful entries.
- **Repository:** retain historical statistical observations and supporting evidence in existing Supabase tables, with category/region/date filters. Daily incremental ingestion appends to the repository.
- **Smart Cards:** display filtered governed evidence and linked approved editorial publications; avoid duplicating CMS editorial bodies.
- **Public API:** `gpir-public-intelligence?view=aggregate&kind=announcements|statistics&topic=...&region=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=25&offset=0` returns exact filtered totals, category and region counts, daily counts, and bounded records through service-only `gpir_m40_repository_query`.
- **Safety:** no direct public SQL execution grants; the Edge Function calls the RPC with server-side credentials, preserves existing topicContext entitlement enforcement and returns 503 rather than partial totals when the RPC is unavailable.
- **Release order:** verify SQL function and privileges in staging; deploy the SQL function before the updated Edge handler; test representative filters, stable pagination, restricted access and load; then migrate Smart Card/dashboard consumers. Do not merge the incomplete client performance preview PR #571 as final performance acceptance.
- **Current limitation:** this first aggregate contract supports approved announcements and governed statistical references. It does not yet replace every Smart Intelligence dashboard metric, nor prove a 500K-record p95 SLA. No CMS records are created by this change.
