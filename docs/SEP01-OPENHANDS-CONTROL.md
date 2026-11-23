# SEP-01 — GPIR open-source coding control (implementation contract)

Status: IMPLEMENTATION BRANCH — NOT DEPLOYED. Owner mandate: v16 runbook, issue #581.

## Chosen runtime
- OpenHands Agent Canvas + OpenHands Agent Server / automation, self-hosted on an isolated cloud VM or approved private host. **Do not run the agent without a sandbox**.
- Model profile A: approved locally hosted Ollama model; profile B: another explicitly approved model endpoint. Neither profile is assumed to be available or sufficiently capable without testing.
- GitHub remains the PR and CI authority. Supabase remains authoritative for the approved ai_control ledger when provisioned. No new public site or production CMS integration.
- Do not install an unpinned moving version, provision cloud resources, or attach credentials until owner approves the host and its operating cost.

## Control rules
1. Accept only an owner-approved issue/scope and immutable job ID; classify sensitivity as PUBLIC or RESTRICTED.
2. RESTRICTED tasks (auth, secrets, entitlement, payment, release signing) cannot route to unapproved external inference. No secret-bearing files in model context.
3. Allocate one task lease, one branch/worktree, and one idempotency key. Record provider, model, prompt revision, head SHA, checkpoint and cost.
4. Execute in sandbox; no direct pushes to main, no production tokens or database writes, no bypass of signed Payload release.
5. On 429/context exhaustion, checkpoint before switching approved model; never resume two workers for the same job concurrently.
6. If no eligible provider exists, mark QUEUED and preserve state. Never claim completion.
7. Require tests, code review, security and signed-release gates before merging.
8. Keep Contentful BCP untouched and all GPIR intelligence confidence/archival policies unchanged.

## First acceptance exercise
- In a throwaway branch, make a tiny non-sensitive test edit with OpenHands, capture checkpoint, simulate provider unavailability, resume using a second approved model, and create exactly one PR.
- Verify: no duplicate commit/write, preserved task context, no sensitive file access, CI outcome, rollback SHA, recorded model and cost.
- PASS only when execution logs and PR evidence are linked; otherwise BLOCKED with one cause.

## Deployment prerequisite (not a request for additional architecture)
Provide one isolated sandbox host with adequate model resources, approved model weights, pinned OpenHands images, outbound access policy and a scoped GitHub credential. Prefer an already approved private host if available. Infrastructure spending requires owner authorization.

Sources: https://github.com/OpenHands/OpenHands and https://github.com/OpenHands/software-agent-sdk
