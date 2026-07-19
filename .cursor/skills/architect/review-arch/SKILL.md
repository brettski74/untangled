---
name: review-arch
description: >-
  Reconcile /architecture main docs with accumulated ADRs via a conflict-first,
  one-ADR-at-a-time human agreement loop. Use only when the user explicitly
  invokes review-arch or asks to review/roll up architecture decisions. Never
  auto-invoke from refine, implement, verify, or other workflows.
disable-model-invocation: true
---

# Review architecture intent store (ADR roll-up)

Use this skill when a human architect explicitly asks to **review** `/architecture/` and fold ADRs under `decisions/` into the main architecture docs so the intent store stays coherent.

## Hard rules

- **Human-explicit only.** Never start this skill because refine, implement, verify, or any other workflow mentioned architecture. If the user did not ask for `review-arch` / ADR roll-up / architecture review, do not run it.
- Prioritize **architecture docs and human intent**. Do **not** rely heavily on code inspection; do not treat the wider codebase as architectural truth.
- Keep architecture docs **concise and high-signal** (invariants, constraints, intent). Do not paste low-level code behaviour or duplicate `AGENTS.md` / docs wholesale.
- **Never** deprecate or remove material from the main architecture docs without first confirming with the human that it is no longer valid or appropriate.
- **Write architecture files directly**—apply agreed edits to disk; chat stays focused on conflicts, proposed edit summaries, and agreement gates—not long pasted file bodies.
- Do **not** merge the review PR yourself. Wait for explicit human confirmation that the PR is merged before local cleanup.

## Pre-requisites

- Explicit human request to run this skill.
- A usable `/architecture/` store (run `seed-arch` first if the store is still scaffold/empty).
- GitHub access via **user-github** MCP for opening the PR and resolving the authenticated username when needed.
- Covered local git operations via the **git-ai** skill scripts (see `.cursor/skills/git-ai/SKILL.md`). Do not hand-assemble equivalent git chains unless the user asks for raw git.

## Target layout

```text
/architecture/
  principles.md
  constraints.md
  boundaries.md
  tradeoffs.md
  unknowns.md
  decisions/          # ADRs to reconcile (then remove when incorporated)
```

## Steps

1. **Orient** with git-ai `scripts/git-status.sh` (pass optional issue `N` if the user supplied one). If the tree is in a bad state for branching, stop and resolve with the user first.
2. **Empty / missing store guard:** If `/architecture/` is missing or still scaffold-only (no substantive seeded content), stop and point the human at **`seed-arch`** before continuing.
3. **Branch choice:**
   - If already on a **non-default** branch: tell the user the current branch name and ask whether to perform the review **on this branch**. Only run `scripts/sync-default.sh` and `scripts/checkout-branch.sh` if they agree to leave the current branch for a new one; otherwise stay and work on the current branch.
   - If on the **default** branch (or they agreed to switch): sync via `scripts/sync-default.sh`, then `scripts/checkout-branch.sh <branch>` where:
     - User supplied ticket `N` → `feature/<N>-review-architecture` (or their preferred short kebab summary with that `N`).
     - No ticket → `arch/review-arch-<username>` (`<username>` = authenticated GitHub login from user-github `get_me`, lowercased).
4. **Ticket association for the PR:** If the current branch matches `<prefix>/<N>-<kebab-case-summary>` (e.g. `feature/42-…`), ask whether this PR should close/fix that open ticket. If yes, use `Fixes #N` in the PR body. If the user supplied `N` explicitly, use that unless they say otherwise.
5. **Conflict pass (mandatory, before any incorporation):**
   - List ADRs under `/architecture/decisions/` (ignore non-ADR placeholders such as `.gitkeep`).
   - Review **all** current ADRs for contradictions with each other and, where relevant, with the main architecture docs.
   - Summarize each conflict to the user.
   - Resolve conflicting ADRs **with the human first** (edit, supersede, or drop by agreement). Do **not** incorporate any non-conflicting ADRs into the main docs until the conflict set is cleared.
6. **One ADR at a time:** For each remaining ADR, in a stable order (e.g. filename / date order):
   - Propose the **concrete** edits to the applicable main docs (`principles.md`, `constraints.md`, `boundaries.md`, `tradeoffs.md`, `unknowns.md`).
   - Apply edits only after the human **agrees** for that ADR.
   - After agreement and incorporation: **remove** the ADR file from `decisions/`.
   - Do not move on to the next ADR until this ADR is incorporated and removed (or explicitly deferred/discarded by the human).
7. **Context budget nudge:** Once every **10 ADRs** processed in the session (incorporated, deferred, or discarded), remind the human to check context usage and consider a fresh chat. If they want a new chat or say context is full, produce a **handoff prompt** that includes enough state to continue `review-arch` elsewhere (branch name, conflict-pass status, ADRs remaining, last completed ADR, open human decisions).
8. **After all ADRs:** When `decisions/` has no remaining ADRs (or the human stops the roll-up), solicit feedback on **additional improvements** to the architectural documents beyond ADR roll-up. Apply agreed follow-ups the same way (direct file edits; no silent deletions).
9. When the human agrees the review is complete: briefly list paths touched. Wait for explicit approval to commit and open the PR.
10. After approval: **commit and push** via git-ai (`scripts/stage-commit.sh`, then `scripts/push.sh`), then **open a PR** with user-github MCP (include `Fixes #N` when agreed in step 4).
11. Tell the user the PR URL and that you are waiting for them to merge (or confirm merge).
12. **Only after** the user explicitly confirms the PR is merged: run git-ai `scripts/sync-default.sh --delete-branch <branch>` and report that local cleanup is done. Skip deleting the branch if the review stayed on a long-lived branch the user wants to keep—confirm first.

## Notes

- Prefer minimal, surgical diffs when folding ADR content into main docs.
- Primary workflow agents (refine / implement / verify) must **NEVER** consult `/architecture/`. This skill (and other architect skills) are the only agents that may read or write it.
- Out of scope for this skill: implementing `record-decision`, `change-review`, and wiring architect hooks into workflows.
