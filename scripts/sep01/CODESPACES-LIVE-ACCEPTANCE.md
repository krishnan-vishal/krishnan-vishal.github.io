# SEP-01 Codespaces live handoff — operator acceptance
The Codespaces runner is intentionally opt-in. It uses an isolated disposable git repository and makes two real authenticated OpenRouter model requests. It **does not** control the Codex/Copilot/Cline UI or push commits. It simulates HTTP 429 **after** a real first checkpoint to test safe continuation.

From an existing GPIR Codespace, check out the SEP-01 PR branch in a separate worktree (do not replace any ongoing Codex branch):
```bash
git fetch origin feat/sep01-central-command-controller-20261120
git worktree add /tmp/gpir-sep01-run origin/feat/sep01-central-command-controller-20261120
cd /tmp/gpir-sep01-run
```
Use the existing Codespaces `OPENROUTER_API_KEY` secret, and select **two distinct, explicitly approved model IDs** with sufficient quotas. For example, set `SEP01_PRIMARY_MODEL` and `SEP01_FALLBACK_MODEL` in the terminal. Do not paste tokens into scripts or logs.
```bash
node --test scripts/sep01/*.test.mjs
node scripts/sep01/codespaces-live-handoff.mjs
```
Acceptance requires `SEP01_LIVE_TWO_MODEL_HANDOFF_PASS` and two distinct commit hashes. A quota or unavailable-model response is a failed acceptance, not permission to retry indefinitely. The runner never pushes or deploys.

**Boundary:** This verifies two OpenRouter models, not independent Codex/Copilot/Claude credentials or automated control of Cline. Production automatic agent handoff remains unverified until approved agent-specific adapters exist.
