---
name: refine
description: >-
  Refine a feature GitHub issue by iterating on a local draft under
  .refinement/, then publish the agreed text to the issue body and label
  READY. Use when refining requirements, scoping a feature issue, running
  /refine, or when the user asks to refine a ticket before implementation.
disable-model-invocation: true
---

# Requirements refinement workflow

Use this workflow when turning a **feature** GitHub issue into a single, agreed requirements document on GitHub.

**Scope of this skill:** Refinement is done by a single product owner in collaboration with AI assistance. A multi-person / team refinement process is out of scope for now.

## Draft storage (required)

During refinement, the **working requirements document** is a local file:

```text
.refinement/<N>-draft.md
```

where `<N>` is the GitHub issue number.

- **Write and revise only in this file.** Do not put the draft requirements in the chat, and do not update the GitHub issue body while iterating.
- Chat is for discussion, questions, and gap analysis only. Point the user at the draft file for review.
- The local file exists so the human reviewer can use IDE diffs to see what changed each pass—do not bypass it.
- `.refinement/` creation and draft-path facts come from the **git-ai** preflight script (see Steps); do not `mkdir` or probe them by hand.

## Pre-requisites

- A **fresh chat** dedicated to this refinement (do not reuse a thread that mixed another ticket’s implementation or UAT).
- The target issue **number** `N` and repository context (owner/repo or equivalent).
- **GitHub access** via `**user-github` MCP** for reads, assignment at start, and creating child issues. **Finish/publish** uses git-ai `refine-publish.sh` (`gh`), not MCP body paste. If MCP is unavailable for the read/assign/create steps, abort and report the problem to the user.
- The issue must be **open**; if it is closed or marked duplicate, confirm with the user before proceeding.
- **Assignment:** the issue must be either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn the user that someone else may already be working on this ticket—do not reassign or continue. If it is unassigned, assign it to the current user.
- The issue should not be labelled as READY. If it is, confirm with the user whether re-refinement is really necessary.

## Steps

1. **Preflight (mechanical)**: run `.cursor/skills/git-ai/scripts/refine-preflight.sh <N>` (git-ai skill) first. It ensures `.refinement/` exists and prints `repo_root`, the raw `origin_url`, `issue_number`, `draft_path`, and `draft_exists`. Derive `owner`/`repo` from `origin_url` yourself. Do not run ad-hoc `git remote`, `mkdir`, or draft-path probes for facts the script already prints. If `draft_exists=yes`, a prior refinement may be incomplete—raise it with the user before overwriting.
2. **Classify** the issue: this workflow targets **features**, not bugs. If the issue reads as a defect report or is misclassified, call that out and agree with the user whether to treat it as refinement (possibly after re-scoping) or hand off to another process before rewriting scope.
3. **Read** the issue (title, body, labels, assignees, and relevant comments) from GitHub. Enforce the open/assignment/READY pre-requisites above before drafting.
4. **Draft** a fully detailed story into `.refinement/<N>-draft.md`: user voice, context, explicit **out of scope**, **acceptance criteria**, and risks/limitations/caveats. Seed from the current issue body if useful, but the draft file is the source of truth for the rest of this workflow.
5. **Discuss gaps** with the user in chat; revise `.refinement/<N>-draft.md` until the user explicitly agrees the requirements are correct and complete. Do **not** update GitHub during this loop.
6. **Only after** that explicit agreement: run `.cursor/skills/git-ai/scripts/refine-publish.sh <N>`. That script publishes `.refinement/<N>-draft.md` to the issue body via `gh issue edit --body-file`, ensures the READY label, unassigns the issue, deletes the draft (and `.refinement/` if empty), and prints verified issue state. Do **not** paste the draft through `issue_write`, invent Python/JSON serializers, hand-roll `gh`/`curl` publish chains, or chain extra `gh` verification onto the script.
7. Inform the user that this workflow is complete using the script’s output (issue URL, labels, assignees, body size).

## Notes

- **NEVER** consult `/architecture/`. That intent store is private to architect skills. Do not read it for refinement guidance or paste its contents into drafts or chat.
- Until READY, the draft lives only in `.refinement/<N>-draft.md`. The GitHub issue body is updated once at the end (via `refine-publish.sh`), not on every revision.
- Large issue bodies are fine for **user-github** MCP when calling `issue_write` directly—do not invent workarounds “because 14k is too big.” Refine finish still uses `--body-file` because the draft is already a local file and that keeps agents from re-encoding it.
- Avoid restating project conventions that already live in rules, skills, or **AGENTS.md**—reference them when needed; do not paste or paraphrase that material into the draft or the issue.
- If requirements change materially later, either run this workflow again or treat the change as implementation detail via the **implement** skill, as the team prefers.
- The github issue should not be labelled READY unless and until the user has explicitly agreed that the requirements are correct and complete and we're ready to finish off this workflow.
- Don't assume we're ready just because the user has given you some feedback. Wait for explicit agreement from the user that the ticket is ready or the refinement is complete or it's time to finish the workflow.
- If the required work appears very large, suggest a proposed breakdown of the work into more manageable child tickets in the chat. **Do not create child tickets** unless and until the user agrees. As a guideline, a ticket should be considered too large if it appears likely to consume more than 150k of context during implementation, including automated test runs but not user driven UAT.
