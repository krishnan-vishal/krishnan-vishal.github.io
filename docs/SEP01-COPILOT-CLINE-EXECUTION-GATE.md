# SEP-01 next execution: Copilot and Cline

## Decision
Aider remains in the six-provider registry but is parked after twelve failed live acceptances. Do not run or alter Aider as a dependency for this milestone. Gemini and OpenRouter remain the previously accepted independent API routes. Their historical acceptance is not proof of current job availability.

## Copilot — existing entitlement, no new key
1. On an existing Copilot-authenticated runner, establish that the supported Copilot CLI is installed and authenticated without printing tokens.
2. Execute exactly one disposable, allowlisted `scripts/sep01/` fixture edit using the existing bridge contract.
3. Verify exact output, changed-path allowlist, tests and local Git checkpoint. No push or deployment.
4. Record provider, version, runner class, auth PASS/FAIL and checkpoint hash, never credentials.
5. Only then make Copilot eligible for usage-aware routing. If no authenticated runner exists, report BLOCKED_AUTHENTICATED_HOST rather than install or request a new key.

## Cline — existing VS Codium host
1. Confirm the actual Cline extension is installed and authenticated on the owner's existing VS Codium host.
2. Use a separately approved local host transport; a browser dashboard and GitHub-hosted Actions runner cannot invoke a local editor extension by assumption.
3. Execute one disposable fixture edit through `createAgentBridge` with the same allowlist and checkpoint tests.
4. Record bounded acceptance evidence. Never transmit tokens, repository secrets, or sensitive code through the public GPIR site.
5. Until host transport is verified, report BLOCKED_HOST_TRANSPORT and leave Cline ineligible.

## Global acceptance
No provider is enabled by registry status, CLI presence or a passing mocked bridge test alone. Require actual authenticated bounded edit + checkpoint recovery. No production writes, no additional API keys, no new architecture, no Aider retries. 
