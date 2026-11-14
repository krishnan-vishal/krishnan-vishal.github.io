// Payload's initial collection migration must be generated with
// `npm run migrate:create -- initial_gpir_editorial_schema` against the approved
// non-production database after the schema-isolation migration has been applied.
// Keeping this list empty makes an unprovisioned deployment fail closed: push is
// disabled and no runtime process can synthesize production DDL.
export const migrations = []
