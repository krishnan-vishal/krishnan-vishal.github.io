# SEP-01 Cloud Workspace and PowerShell Proof

## Purpose
Demonstrate that the existing GPIR repository can be checked out and inspected using PowerShell 7 on a GitHub-hosted runner, with no dependency on an office PC.

## Existing architecture
- GPIR hosting, Cloudflare delivery, Payload CMS, Supabase identity, entitlements and governance remain unchanged.
- GitHub is the source of version-controlled project files. GitHub Actions runs ephemeral jobs on hosted runners.
- This is **not** a Google Cloud migration, an automatic local-folder backup, or a persistent cloud desktop.

## Bounded manual acceptance
Run the workflow **SEP-01 cloud PowerShell workspace proof** on the approved branch with operation `workspace-proof`. The workflow uses `shell: pwsh` on `ubuntu-latest`, verifies three existing repository files, and uploads a JSON receipt as a seven-day GitHub Actions artifact. It has read-only repository permission and no API keys.

## Security and boundaries
- No user-entered PowerShell, arbitrary commands, script paths or unrestricted remote shell.
- No repository writes, production deployment, paid provider calls, or changes to existing SEP-01 dispatch.
- Runner files disappear when the job ends; only explicitly uploaded artifacts persist for the configured retention period.
- Files present only on a personal machine are **not** automatically migrated. They require an explicit authorized upload or Git commit.
- Central Command UI-to-workflow dispatch and receipt retrieval are **not yet wired**. This workflow is the cloud runner foundation, not a claim of end-to-end Central Command integration.
- Existing owner-authenticated gateway must authorize any future bounded dispatch integration. No client-side GitHub token.
