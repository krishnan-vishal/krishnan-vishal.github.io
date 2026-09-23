# M35-F4J-2 required metadata semantics

`publicationStatus` is source-authored business publication state. It remains distinct from the Contentful technical `Draft` state and the M35 `migrationStatus`. A missing source status stays null and blocks content readiness; migration must not assign `Draft` or `Published` as a substitute.

`directionScope` and `useCasePaymentCategory` are structured intelligence metadata. Generic country intelligence can have no singular direction or payment category. Preserve explicit source-supported values; otherwise keep null. Their absence alone is not a required-field blocker or migration review warning. The converter's historical extraction warnings remain intact, but Draft mapping and readiness ignore those two absence codes. `dataCutOffDate` remains a nonblocking mapping gap and null unless an exact cutoff date is evidenced.

The repository manifest reports `contentReadiness` separately from `identityReadiness`. An unqueried registry is `REGISTRY_LOOKUP_REQUIRED`, not evidence that an identity is absent or conflicting. Overall F4K readiness cannot be `READY` while that lookup remains outstanding. No identity is allocated during manifest generation.
