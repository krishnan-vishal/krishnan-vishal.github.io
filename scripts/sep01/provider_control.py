#!/usr/bin/env python3
"""SEP-01 deterministic provider selection and checkpoint state machine.

No network, credentials, model execution or production write access.
Used by a separately sandboxed OpenHands runner; policy fails closed.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path

STATES = {"QUEUED", "LEASED", "CHECKPOINTED", "PR_READY", "BLOCKED"}
TIERS = {"PUBLIC", "RESTRICTED"}

@dataclass(frozen=True)
class Provider:
    name: str
    approved: bool
    local: bool
    available: bool
    quota_remaining: int

def choose_provider(providers: list[Provider], tier: str, exclude: str = "") -> str | None:
    if tier not in TIERS:
        raise ValueError("unknown sensitivity tier")
    eligible = [p for p in providers if p.approved and p.available and p.quota_remaining > 0
                and p.name != exclude and (tier == "PUBLIC" or p.local)]
    return sorted(eligible, key=lambda p: (not p.local, p.name))[0].name if eligible else None

def checkpoint(path: Path, state: dict) -> None:
    if state.get("status") not in STATES:
        raise ValueError("invalid status")
    if not state.get("job_id") or not state.get("branch") or not state.get("head_sha"):
        raise ValueError("missing immutable job identity")
    if state.get("sensitivity") not in TIERS:
        raise ValueError("missing sensitivity classification")
    if path.exists():
        old = json.loads(path.read_text())
        if old["job_id"] != state["job_id"] or old["branch"] != state["branch"]:
            raise ValueError("checkpoint identity mismatch")
        if old.get("pr_number") and state.get("pr_number") != old["pr_number"]:
            raise ValueError("PR identity changed")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, sort_keys=True, indent=2) + "\n")
    temp.replace(path)

def failover(path: Path, providers: list[Provider]) -> dict:
    state = json.loads(path.read_text())
    if state["status"] not in {"LEASED", "CHECKPOINTED"}:
        raise ValueError("cannot fail over non-active job")
    next_provider = choose_provider(providers, state["sensitivity"], state.get("provider", ""))
    state["provider"] = next_provider
    state["status"] = "CHECKPOINTED" if next_provider else "QUEUED"
    state["attempt"] = int(state.get("attempt", 0)) + (1 if next_provider else 0)
    checkpoint(path, state)
    return state

if __name__ == "__main__":
    raise SystemExit("Policy library only: invoke from an approved sandboxed agent runner.")
