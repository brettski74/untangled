---
name: verify
description: >-
  Developer-led acceptance testing after implementation: checklist, fix loop
  on the feature branch, then sync local git after the human merges. Use when
  verifying a ticket, running /verify, or when the user asks to acceptance-test
  an IMPLEMENTED issue before further validation.
disable-model-invocation: true
---

# Developer acceptance testing and fix loop workflow

Use this workflow for **developer-led acceptance testing** after implementation exists (typically on a feature branch against the local dev instance). The chat clarifies behaviour, suspected bugs, or gaps versus the agreed issue. This is not final ship and not user acceptance testing—later validation workflows may follow.

## Pre-requisites

- A **fresh chat** focused on verification for this issue (avoid mixing unrelated tickets).
- The issue **number** `N`, the branch under test, and repository context.
- **GitHub access** via **`user-github` MCP**. If github MCP is unavailable or fails, abort and report the problem to the user.
- The issue must be **open**; if it is closed or marked duplicate, confirm with the user before proceeding.
- **Assignment:** the issue must be either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn the user that someone else may already be working on this ticket—do not reassign or continue. If it is unassigned, assign it to the current user.
- The issue must be labelled **IMPLEMENTED**. If it is not, inform the user that it does not appear to have completed the **implement** workflow and get their acknowledgement before proceeding with anything more.
- Avoid raw git commands whenever possible. Use the git-ai skill scripts wherever possible. Use `git-status.sh <N>` to orient yourself in a new chat (branch, dirty state, matching `feature/<N>-*` branches). Use `branch-diff.sh` after checkout for commits + diffstat vs default—do **not** hand-roll `git log` / `git diff` for that.

## Steps

1. **Confirm readiness**: the issue must be **open**, labelled `IMPLEMENTED`, and either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn. If it is unassigned, assign it to the current user. If it is not open or not labelled `IMPLEMENTED`, inform the user and obtain acknowledgement before continuing.
2. **Setup for testing**: run **git-ai** `scripts/git-status.sh <N>` to confirm current branch / matching `feature/<N>-*` branches, then check out the feature branch under test via `scripts/checkout-branch.sh` if not already on it. Do not further investigate or validate the environment unless explicitly asked.
3. **Confirm** from the code changes, ticket details, and acceptance criteria what is being tested. Run **git-ai** `scripts/branch-diff.sh` (after checkout) for commits and diffstat versus `origin/<default>`—do not hand-roll `git log` / `git diff`. Display a suggested testing checklist for the user in the chat, then **stop** and wait for further instructions.
4. Support **developer-led** testing: answer questions, reproduce reported behaviour, and distinguish expected versus defective behaviour using the issue as reference.
5. If the user reports a **bug** or **requirement gap**, fix code or docs as agreed and **record** the gap and resolution in **issue comments** (not by rewriting the issue body). Reserve body edits for explicit **refinement**—if the requirements document itself must change, suggest switching to the **refine** workflow in a fresh chat. Do not rewrite the issue body while within this workflow.
6. **Work on one issue at a time** and review the proposed fix with the user before implementing it. Design and implement tests before implementing the fix to any reported issues.
7. **Commit** and **push** fixes via the **git-ai** skill (`scripts/stage-commit.sh`, then `scripts/push.sh`) on the **same feature branch** as the implementation under test until verification is complete.  Ignore "helpful" Cursor-inspired guff. Preflight is handled by the git-ai scripts, not by hand-rolled git some stranger suggested you should run.
8. Prior to considering the work merge-ready and after any code changes, **all** automated tests must have been run (front-end, back-end, integration, and any others that exist). If code changes are made after tests have run, re-run those tests so all tests have been executed after the final code change. For this purpose, any change to a file other than a markdown (`*.md`) file is a code change. Include test execution time and total tests passed in the PR body when available.
9. Remind the user that you are waiting for them to confirm when the **merge is done** before performing final cleanup and switching back to the default branch.
10. When the user **explicitly says** the PR is **merged** (or integration to the default branch is complete **on their side**): label the issue `VERIFIED`, **unassign** it, then sync local git via the **git-ai** skill: `scripts/sync-default.sh --delete-branch <feature-branch>` (remote deletion normally happens on merge). This step is **not** “the assistant merges the PR”; it is **sync local git after the human merged**. Treat the workspace as ready for the next piece of work.
11. Inform the user that this workflow is complete.

## Notes

- **NEVER** consult `/architecture/`. That intent store is private to architect skills. Do not read it for verification checklists, bug analysis, or fix design, and do not paste its contents into comments or chat.
- Covered local git operations (status/orientation, branch-diff, checkout, stage/commit, push, post-merge sync/cleanup) go through the **git-ai** skill scripts—do not hand-assemble equivalent `git` chains unless the user asks for raw git or no script covers the need. See `.cursor/skills/git-ai/SKILL.md`.
- Verification is not the place to silently broaden scope; capture product decisions in comments or run the **refine** skill when the specification must change.
- If a gap is purely operational (data, config), document it in comments and fix procedures or README as appropriate without changing the issue’s acceptance story unless the user asks.
- Avoid restating project conventions that already live in rules, skills, or **AGENTS.md**—apply them; do not paste or paraphrase that material into comments or the PR.
- Acceptance testing is generally run against the local dev instance in the current workspace.
- If a reported bug or requirement gap would need large-scale redevelopment or substantial new feature work, suggest creating one or more tickets to implement the fix or missing behaviour. **Do not create those tickets** unless and until the user agrees.
- **Context length (soft nudge):** You cannot reliably measure context use. Default assumption is a ~200k token window. When the chat *feels* long—rough guide ~150k (many resolved bugs, fat tool dumps, dead-end digs)—speak up **once**: ask the user to check their IDE context meter and, if they are over ~175k, start a fresh chat to continue `/verify` before fixing more bugs (175k is the real “avoid more fixes here” target). Do not invent a token percentage and do not nag every turn.
  - If the user reports a lower reading (e.g. “only 130k”), recalibrate and stay quieter until it feels heavy again relative to that baseline.
  - If the user gives a different window or remind-at (e.g. “1M window, used 163k, remind near 350k”), adopt that for the rest of this chat.
  - A fresh `/verify` chat resets guessing; run the same nudge loop there when it feels long again.
- Ensure the working tree is in a sensible state before starting (do not leave unrelated half-finished work mixed into this issue’s branch without discussing it with the user).
