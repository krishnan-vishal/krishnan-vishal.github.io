# GPIR migration handover

## Resume point

- Repository: `krishnan-vishal/krishnan-vishal.github.io`
- Branch: `codex/gpir-payload-cms-migration-20261114`
- Payload foundation commit: `00ec401c21891fb934a47028e00534cbf71d1a81`
- Production services changed: **none**
- Contentful migration started: **no**
- Production cutover enabled: **no**

Start every replacement-agent session by reading this file and `AGENTS.md`.

## Replacement AI coding environment

The Codespace devcontainer installs the official Cline VS Code extension. Project rules live in `.cline/rules/gpir-migration.md` and travel with the branch. Cline's provider credentials remain in its user-level configuration and are never committed.

OpenRouter is the primary cloud gateway. The owner chooses the model at runtime; the repository does not pin a model. Direct Anthropic, OpenAI, Google or any Cline-supported/OpenAI-compatible provider can be selected instead without changing the application architecture.

Create these repository or organization **Codespaces secrets** as needed:

| Secret | Purpose | Required now |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Primary Cline gateway | Yes |
| `ANTHROPIC_API_KEY` | Optional direct provider | No |
| `OPENAI_API_KEY` | Optional direct provider | No |
| `GEMINI_API_KEY` | Optional direct provider | No |
| `GPIR_AI_MODEL` | Optional owner-selected model hint | No |

After adding or changing a Codespaces secret, stop and recreate the Codespace so the environment receives it. In the Cline panel, open Settings, choose **OpenRouter**, enter the owner-held key, and choose a model appropriate to the task and budget. Cline stores that credential in user configuration; never write `~/.cline/data/settings/providers.json` into this repository.

Verification is deliberately offline and reports only whether expected environment variables exist:

```bash
node scripts/verify-ai-coding-environment.mjs
```

## Completed migration foundation

- Separate Next.js/Payload app under `apps/gpir-cms`; existing production routes and deployments are untouched.
- Official Payload PostgreSQL adapter configured for isolated schema `payload`, with automatic schema push disabled.
- Version-controlled Supabase role/schema isolation migration prepared but not applied.
- Collections prepared for research publications, chapters, countries, regions, editorial metadata, media, users and immutable release events.
- Canonical GPIR IDs, Contentful IDs, lineage, canonical URLs, access classification and publication state are retained.
- Supabase Storage S3 adapter and server-only environment contract are prepared.
- Restartable two-pass Contentful export/import and reconciliation tools are implemented but have not been run.
- Authorized release service binds every publication to an exact Supabase release decision and signs release bundles.
- Manual workflows can back up Contentful or propose a release PR; neither workflow changes production directly.
- Existing ASK GPIR, FX Intelligence, Smart Intelligence, My GPIR and Global Alerts behavior remains unchanged.

Detailed architecture and acceptance gates are in `docs/M41-PAYLOAD-CMS-MIGRATION.md`.

## Authority boundaries

| Area | Authority |
| --- | --- |
| Editorial publication content | Payload after accepted migration/cutover |
| Intelligence records and evidence | Supabase |
| Authentication and entitlements | Supabase |
| Publication eligibility | Supabase release decision function |
| Public static delivery | Existing reviewed GitHub/Cloudflare path until authorized cutover |
| AI provider/model | Owner-selected Cline configuration |

## Pending owner-controlled actions

1. Confirm `OPENROUTER_API_KEY` is a Codespaces secret (add it if absent), recreate the Codespace after any secret change, select OpenRouter and a budget-appropriate model in Cline, then run the focused verifier.
2. Provision an approved non-production Payload database login and Supabase Storage S3 credentials.
3. Apply `supabase/migrations/20261114020220_gpir_payload_schema_isolation.sql` only to the approved non-production target.
4. Generate and review the initial Payload table migration against that non-production database.
5. Supply a Contentful organization-granted Management API token through the protected migration environment.
6. Only after explicit authorization: run the secure export, two-pass import and reconciliation.
7. Keep production cutover, final delta import and Contentful retirement behind separate owner approvals.

## Exact next commands

From the repository root in the recreated Codespace:

```bash
git switch codex/gpir-payload-cms-migration-20261114
git pull --ff-only origin codex/gpir-payload-cms-migration-20261114
node scripts/verify-ai-coding-environment.mjs
cd apps/gpir-cms
npm ci
npm test
npm run typecheck
```

Stop if the verifier reports `openRouterReady: false`; the owner must add the Codespaces secret and recreate the Codespace. Do not start the Contentful migration or apply database changes as part of environment setup.
