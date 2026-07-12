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
- Create `.refinement/` if it does not exist.

## Pre-requisites

- A **fresh chat** dedicated to this refinement (do not reuse a thread that mixed another ticket’s implementation or UAT).
- The target issue **number** `N` and repository context (owner/repo or equivalent).
- **GitHub access** via `**user-github` MCP**. If github MCP is unavailable or fails, abort and report the problem to the user.
- The issue must be **open**; if it is closed or marked duplicate, confirm with the user before proceeding.
- **Assignment:** the issue must be either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn the user that someone else may already be working on this ticket—do not reassign or continue. If it is unassigned, assign it to the current user.
- The issue should not be labelled as READY. If it is, confirm with the user whether re-refinement is really necessary.

## Steps

1. **Classify** the issue: this workflow targets **features**, not bugs. If the issue reads as a defect report or is misclassified, call that out and agree with the user whether to treat it as refinement (possibly after re-scoping) or hand off to another process before rewriting scope.
2. **Read** the issue (title, body, labels, assignees, and relevant comments) from GitHub. Enforce the open/assignment/READY pre-requisites above before drafting.
3. **Draft** a fully detailed story into `.refinement/<N>-draft.md`: user voice, context, explicit **out of scope**, **acceptance criteria**, and risks/limitations/caveats. Seed from the current issue body if useful, but the draft file is the source of truth for the rest of this workflow.
4. **Discuss gaps** with the user in chat; revise `.refinement/<N>-draft.md` until the user explicitly agrees the requirements are correct and complete. Do **not** update GitHub during this loop.
5. **Only after** that explicit agreement: update the GitHub issue body with the final draft text (for example `issue_write` with `method: update` and the new `body`) so the issue becomes the **single source of truth**, then label the issue as READY.
6. Delete `.refinement/<N>-draft.md` (and the `.refinement/` directory if empty). Inform the user that this workflow is complete.

## Notes

- Until READY, the draft lives only in `.refinement/<N>-draft.md`. The GitHub issue body is updated once at the end, not on every revision.
- Avoid restating project conventions that already live in rules, skills, or **AGENTS.md**—reference them when needed; do not paste or paraphrase that material into the draft or the issue.
- If requirements change materially later, either run this workflow again or treat the change as implementation detail via the **implement** skill, as the team prefers.
- The github issue should not be labelled READY unless and until the user has explicitly agreed that the requirements are correct and complete and we're ready to finish off this workflow.
- Don't assume we're ready just because the user has given you some feedback. Wait for explicit agreement from the user that the ticket is ready or the refinement is complete or it's time to finish the workflow.
- If the required work appears very large, suggest a proposed breakdown of the work into more manageable child tickets in the chat. **Do not create child tickets** unless and until the user agrees. As a guideline, a ticket should be considered too large if it appears likely to consume more than 150k of context during implementation, including automated test runs but not user driven UAT.
