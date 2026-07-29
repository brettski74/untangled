---
name: diagnose
description: >-
  Diagnose a bug GitHub issue by iterating on a local draft under
  .refinement/, then publish the agreed text to the issue body and label
  READY. Use when clarifying a defect, scoping a bug fix, running
  /diagnose, or when the user asks to diagnose a ticket before
  implementation.
disable-model-invocation: true
---

# Bug diagnosis workflow

Use this workflow when turning a **bug** (defect, malfunction, or noncompliance) GitHub issue into a single, agreed diagnosis document on GitHub.

**Scope of this skill:** Diagnosis is done by a single product owner in collaboration with AI assistance. A multi-person / team diagnosis process is out of scope for now.

**Contrast with refine:** Refine scopes **new** behaviour and may explore design options. Diagnose stays inside **existing** functionality: clarify the malfunction or noncompliance, how to reproduce it, and expected versus actual results. Prefer the smallest fix that restores correct, consistent behaviour with the surrounding application—do not expand into unrelated features or redesigns.

## Draft storage (required)

During diagnosis, the **working diagnosis document** is a local file:

```text
.refinement/<N>-draft.md
```

where `<N>` is the GitHub issue number.

- **Write and revise only in this file.** Do not put the draft diagnosis in the chat, and do not update the GitHub issue body while iterating.
- Chat is for discussion, questions, and clarifying the bug only. Point the user at the draft file for review.
- The local file exists so the human reviewer can use IDE diffs to see what changed each pass—do not bypass it.
- `.refinement/` creation and draft-path facts come from the **git-ai** preflight script (see Steps); do not `mkdir` or probe them by hand.

## Pre-requisites

- A **fresh chat** dedicated to this diagnosis (do not reuse a thread that mixed another ticket’s implementation or UAT).
- The target issue **number** `N` and repository context (owner/repo or equivalent).
- **GitHub access** via **`user-github` MCP** for reads, assignment at start, and creating child issues. **Finish/publish** uses git-ai `git-publish.sh` (`gh`), not MCP body paste. If MCP is unavailable for the read/assign/create steps, abort and report the problem to the user.
- The issue must be **open**; if it is closed or marked duplicate, confirm with the user before proceeding.
- **Assignment:** the issue must be either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn the user that someone else may already be working on this ticket—do not reassign or continue. If it is unassigned, assign it to the current user.
- The issue should not be labelled as READY. If it is, confirm with the user whether re-diagnosis is really necessary.

## Steps

1. **Preflight (mechanical)**: run `.cursor/skills/git-ai/scripts/git-preflight.sh <N>` (git-ai skill) first. It ensures `.refinement/` exists and prints `repo_root`, the raw `origin_url`, `issue_number`, `draft_path`, and `draft_exists`. Derive `owner`/`repo` from `origin_url` yourself. Do not run ad-hoc `git remote`, `mkdir`, or draft-path probes for facts the script already prints. If `draft_exists=yes`, a prior draft may be incomplete—raise it with the user before overwriting.
2. **Classify** the issue: this workflow targets **bugs**, not features. If the issue reads as a new capability or deliberate behaviour change, **warn** the user of possible misclassification and suggest **refine**. If the human **confirms** it should still be treated as a bug, continue as directed.
3. **Read** the issue (title, body, labels, assignees, and relevant comments) from GitHub. Enforce the open/assignment/READY pre-requisites above before drafting. Prefer the issue already labelled `bug`; if it is a confirmed bug and unlabelled, apply the `bug` label.
4. **Interview and draft** into `.refinement/<N>-draft.md` (high-level clarification with the user—**not** deep code investigation; root-cause digging belongs in **implement**). Include:
   - **User voice** (who is affected and what they experience)
   - Summary of the malfunction / noncompliance
   - Reproduction steps (and environment notes if needed)
   - Expected versus actual results
   - Suspected or confirmed cause at a high level only (as far as diagnosis goes)
   - Fix scope and explicit **out of scope** (no drive-by features or redesigns)
   - Acceptance criteria for the fix
   - Risks / limitations / caveats / regression concerns

   Seed from the current issue body if useful, but the draft file is the source of truth for the rest of this workflow.
5. **Architect review (diagnosis draft):** Before pointing the human at the draft for substantive review, run the **architect review gate** (see Notes) on `.refinement/<N>-draft.md`. Provide review context that this is a **diagnosis draft** clarifying bug details, repro, and expected/actual results, and that the architect should highlight architectural inconsistencies in the proposed fix direction or expected results. Incorporate feedback (max two `review-pass` invocations for this review set), then surface any new ADRs to the user when presenting the draft.
6. **Discuss gaps** with the user in chat; revise `.refinement/<N>-draft.md` until the user explicitly agrees the diagnosis is correct and complete. Do **not** update GitHub during this loop. Do **not** re-run the architect review gate during this loop unless the human **explicitly** requests another architect pass.
7. **Only after** that explicit agreement: run `.cursor/skills/git-ai/scripts/git-publish.sh <N>`. That script publishes `.refinement/<N>-draft.md` to the issue body via `gh issue edit --body-file`, ensures the READY label, unassigns the issue, deletes the draft (and `.refinement/` if empty), and prints verified issue state. Do **not** paste the draft through `issue_write`, invent Python/JSON serializers, hand-roll `gh`/`curl` publish chains, or chain extra `gh` verification onto the script.
8. Inform the user that this workflow is complete using the script’s output (issue URL, labels, assignees, body size). Suggest proceeding with **implement** next.

## Notes

- **NEVER** consult `/architecture/`. That intent store is private to architect skills. Do not read it for diagnosis guidance or paste its contents into drafts or chat.
- **Architect review gate:** Follow `.cursor/skills/architect/change-review/SKILL.md` for resume, settlement, Settled points, purpose labels, and fallback. Use one architect agent for the **whole diagnose run**: first invocation → new Task (`generalPurpose`); retain the agent ID; every later architect invocation in this diagnose run → `resume` that ID. Pass the full draft under review plus **review context** (diagnosis draft; scrutinise expected results and fix scope for architectural inconsistency). Label purpose (`review-pass` / `incorporation-follow-up` / `adr-follow-up`); include Settled points on resume and on fresh-Task fallback. Diagnose never has code changes in scope—do not include diffs. Do not restate the skill’s architecture-guidance or output-format rules in the Task prompt. A **review set** is pass budget / presentation only (max **two** `review-pass` invocations)—it does not reset the agent. Incorporate Violations/Suggestions into the draft, then resume if needed. Exit early if the review reports no material issues. After two `review-pass` invocations, **still present to the human**—include any remaining Risks/Violations and unresolved friction from the last review; do not claim the gate cleared them; do not invent primary “rulings” or overrule the architect (argue and relay human rulings only). If the sub-agent recorded ADRs, tell the user (paths + one-line summaries) when presenting. Primary agents must not read `/architecture/` themselves.
- Until READY, the draft lives only in `.refinement/<N>-draft.md`. The GitHub issue body is updated once at the end (via `git-publish.sh`), not on every revision.
- Large issue bodies are fine for **user-github** MCP when calling `issue_write` directly—do not invent workarounds “because 14k is too big.” Diagnose finish still uses `--body-file` because the draft is already a local file and that keeps agents from re-encoding it.
- Avoid restating project conventions that already live in rules, skills, or **AGENTS.md**—reference them when needed; do not paste or paraphrase that material into the draft or the issue.
- If the diagnosis changes materially later, either run this workflow again or treat the change as implementation detail via the **implement** skill, as the team prefers.
- The github issue should not be labelled READY unless and until the user has explicitly agreed that the diagnosis is correct and complete and we're ready to finish off this workflow.
- Don't assume we're ready just because the user has given you some feedback. Wait for explicit agreement from the user that the ticket is ready or the diagnosis is complete or it's time to finish the workflow.
- If the required fix appears very large or is really new-feature work, suggest a proposed breakdown into more manageable child tickets (or hand off to **refine**) in the chat. **Do not create child tickets** unless and until the user agrees. As a guideline, a ticket should be considered too large if it appears likely to consume more than 150k of context during implementation, including automated test runs but not user driven UAT.
- Do not reference ADRs or other architecture documents directly in the ticket body (or draft). ADRs are part of the architecture store. If an ADR is logged as part of diagnosis, that's great, but in the ticket just say what is required directly without referring to the ADR or anything else in the architecture store. Referencing such documents in a ticket body will only encourage the primary agents which work on this ticket to go snooping around in the architecture store, which is the opposite of what we want. We want the primary agent working from the existing code base and the architect working from an independent architectural intent store.
