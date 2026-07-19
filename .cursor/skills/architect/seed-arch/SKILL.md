---
name: seed-arch
description: >-
  Initialize or re-seed the /architecture intent store from the repository and
  confirmed human architect input. Use only when the user explicitly invokes
  seed-arch or asks to seed architecture. Never auto-invoke from refine,
  implement, verify, or other workflows.
disable-model-invocation: true
---

# Seed architecture intent store

Use this skill when a human architect explicitly asks to **seed** (or re-seed) `/architecture/`. It builds the intent store that later architect skills govern against.

## Hard rules

- **Human-explicit only.** Never start this skill because refine, implement, verify, or any other workflow mentioned architecture. If the user did not ask for `seed-arch` / seeding architecture, do not run it.
- Inspect the repo **outside** `/architecture` only to **infer** candidates for the intent store—not to invent product requirements or dump implementation detail into architecture docs.
- Keep architecture docs **concise and high-signal** (invariants, constraints, intent). Do not paste low-level code behaviour or duplicate `AGENTS.md` / docs wholesale.
- **Write architecture files directly**—never draft substantive architecture content in chat for later confirmation. The human reviews via IDE diffs; chat stays minimal.
- Do **not** merge the seed PR yourself. Wait for explicit human confirmation that the PR is merged before local cleanup.

## Pre-requisites

- Explicit human request to run this skill.
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
  decisions/
```

Create missing files/directories as needed. Existing content may be refined; do not silently delete confirmed material without human agreement.

## Steps

1. **Orient** with git-ai `scripts/git-status.sh` (pass optional issue `N` if the user supplied one). If the tree is in a bad state for branching, stop and resolve with the user first.
2. **Non-empty store guard:** If `/architecture/` already has substantive content (more than scaffold stubs / “awaiting seed-arch” placeholders), stop and ask whether they really want to **re-seed** with `seed-arch`, or whether they meant **`review-arch`** instead. Only continue after explicit confirmation that they want `seed-arch`; then proceed **surgically** (targeted updates, no blind overwrite).
3. **Branch choice:**
   - If already on a **non-default** branch: tell the user the current branch name and ask whether to perform seeding **on this branch**. Only run `scripts/sync-default.sh` and `scripts/checkout-branch.sh` if they agree to leave the current branch for a new one; otherwise stay and work on the current branch.
   - If on the **default** branch (or they agreed to switch): sync via `scripts/sync-default.sh`, then `scripts/checkout-branch.sh <branch>` where:
     - User supplied ticket `N` → `feature/<N>-seed-architecture` (or their preferred short kebab summary with that `N`).
     - No ticket → `arch/seed-arch-<username>` (`<username>` = authenticated GitHub login from user-github `get_me`, lowercased).
4. **Ticket association for the PR:** If the current branch matches `<prefix>/<N>-<kebab-case-summary>` (e.g. `feature/41-…`), ask whether this PR should close/fix that open ticket. If yes, use `Fixes #N` in the PR body. If the user supplied `N` explicitly, use that unless they say otherwise.
5. **Inspect** the repository outside `/architecture` (e.g. `AGENTS.md`, module layout, existing docs) enough to seed content on disk. Prefer structure and stated principles over implementation minutiae.
6. **Write incrementally to disk:** For each pass, write a small coherent chunk straight into the relevant `/architecture/` file(s). In the files (not chat), mark claims as **inferred** vs **confirmed** and note **confidence** (high / medium / low) where useful. In chat, only a brief note of which paths changed—**no** pasted file bodies or long proposal prose. Ask the human to review via IDE diffs, answer clarifying questions, and apply their feedback as further file edits. Update `unknowns.md` as open items emerge or close. Leave `decisions/` for ADRs from later skills unless the human asks to record one during seeding.
7. When the human agrees seeding is complete: briefly list paths touched. Wait for explicit approval to commit and open the PR.
8. After approval: **commit and push** via git-ai (`scripts/stage-commit.sh`, then `scripts/push.sh`), then **open a PR** with user-github MCP (include `Fixes #N` when agreed in step 4).
9. Tell the user the PR URL and that you are waiting for them to merge (or confirm merge).
10. **Only after** the user explicitly confirms the PR is merged: run git-ai `scripts/sync-default.sh --delete-branch <branch>` and report that local cleanup is done. Skip deleting the branch if seeding stayed on a long-lived branch the user wants to keep—confirm first.

## Notes

- Re-seeding after confirmation is surgical: prefer minimal diffs over rewriting whole files.
- Primary workflow agents (refine / implement / verify) must **NEVER** consult `/architecture/`. This skill (and other architect skills) are the only agents that may read or write it.
- Out of scope for this skill: implementing `review-arch`, `record-decision`, `change-review`, and wiring architect hooks into workflows (pointing the user at `review-arch` when appropriate is in scope).
