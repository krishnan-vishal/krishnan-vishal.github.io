# M35-F4H legacy metadata contract

The normalized record and dry-run Draft retain `publicationDate: null` when no explicit publication-level date is supported. Dashboard, citation, source, cutoff, period, chart, related-object, filesystem, Git and inferred dates cannot supply it. `editionLabel: null` is valid when no authored or source-supported publication edition exists. Versions, data periods, cutoff dates, dashboard editions, filenames, URLs and migration order cannot supply an edition label. These nulls are intentional and are not mapping gaps.

`region` continues to use explicit metadata or the governed regional-directory path mapping. Publication ID tokens do not establish a region.

The migration readiness classifier returns `IDENTITY_CONFLICT` for conflicting publication identity evidence or an identity resolver collision-review state; `BLOCKED_REQUIRED_FIELD` for unresolved genuinely required fields or fatal normalization errors; `REVIEW_REQUIRED` for other warnings and mapping review; and `READY` when those checks pass. Missing historical publication date and edition label never block on their own.

## Required Contentful model adjustment

In the `gpirPublication` content type, change **only** `publicationDate` and `editionLabel` field validations from `required: true` to `required: false`. Keep field IDs, types, locales and other validations unchanged. Contentful Draft API mapping must omit each field when its normalized value is null; do not send null as a locale value or substitute a date or edition. Apply and publish this content-model change through an explicitly authorized, version-guarded model update before legacy Draft creation. This gate performs no Contentful model or entry write.
