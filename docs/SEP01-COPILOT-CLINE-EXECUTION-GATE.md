# SEP-01 Next Execution: Copilot and Cline

## Decision
Aider remains in the six-provider registry but is parked after twelve failed live acceptances. Do not run or modify Aider as a dependency for this milestone. Gemini and OpenRouter remain the previously accepted independent API routes. Their historical acceptance does not guarantee current job availability.

## Copilot — Existing Entitlement, No New Key
1. On an existing Copilot-authenticated runner, verify that the supported Copilot CLI is installed and authenticated without displaying tokens.
2. Execute exactly one disposable, allowlisted `scripts/sep01/` fixture edit using the existing bridge contract.
3. Verify the exact output, changed-path allowlist, tests, and local Git checkpoint. Do not push or deploy.
4. Record the provider, version, runner class, authentication PASS/FAIL status, and checkpoint hash; never record credentials.
5. Only then make Copilot eligible for usage-aware routing. If no authenticated runner exists, report BLOCKED_AUTHENTICATED_HOST instead of installing or requesting a new key.

## Cline — Existing VS Codium Host
1. Confirm that the actual Cline extension is installed and authenticated on the owner's existing VS Codium host.
2. Use a separately approved local host transport; a browser dashboard and GitHub-hosted Actions runner cannot invoke a local editor extension by default.
3. Execute one disposable fixture edit through `createAgentBridge` with the same allowlist and checkpoint tests.
4. Record bounded acceptance evidence. Never transmit tokens, repository secrets, or sensitive code through the public GPIR site.
5. Until the host transport is verified, report BLOCKED_HOST_TRANSPORT and keep Cline ineligible.

## Global Acceptance
No provider is enabled solely by registry status, CLI presence, or a passing mocked bridge test. Actual authenticated bounded edits plus checkpoint recovery are required. No production writes, no additional API keys, no new architecture, and no Aider retries are allowed.
