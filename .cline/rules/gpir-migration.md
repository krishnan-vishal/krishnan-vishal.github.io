# GPIR migration operating rules

- Read `GPIR_MIGRATION_HANDOVER.md` before changing the migration implementation.
- Work only on `codex/gpir-payload-cms-migration-20261114` unless the owner explicitly changes scope.
- Preserve the existing static production routes, Cloudflare/GitHub Pages delivery, Supabase application tables, authentication, entitlements, Global Alerts thresholds and 12-hour archive behavior.
- Payload is the future editorial authority. Supabase remains the authority for intelligence records, evidence, authentication, entitlements and release decisions.
- Never commit API keys, provider credentials, database URLs, export archives or media backups.
- Use Codespaces secrets for cloud AI and service credentials. Do not print secret values in terminal output.
- OpenRouter is the primary AI gateway, but provider and model selection are owner-controlled. Do not add a model-specific dependency or hardcode a model ID.
- Do not run Contentful export/import, database migrations, production cutover or service retirement without the owner authorization described in the handover.
- Prefer focused tests for changed behavior. Do not repeat broad audits already recorded in the handover.
