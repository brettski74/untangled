---
name: implement
description: >-
  Plan, implement, test, and open a pull request for an agreed GitHub issue.
  Use when implementing a ticket, building after refinement, running
  /implement, or when the user asks to implement an issue and open a PR.
disable-model-invocation: true
---

# Implementation and pull request workflow

Use this workflow when building and shipping work for an agreed GitHub issue: plan first, then implement, test, and open a PR.

## Pre-requisites

- A **fresh chat** dedicated to this implementation (avoid cross-ticket context from refinement or UAT unless this is explicitly the same ticket’s continuation after plan approval).
- The issue **number** `N` and repository context.
- **GitHub access** via **`user-github` MCP**. If github MCP is unavailable or fails, abort and report the problem to the user.
- The issue must be **open**; if it is closed or marked duplicate, confirm with the user before proceeding.
- **Assignment:** the issue must be either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn the user that someone else may already be working on this ticket—do not reassign or continue. If it is unassigned, assign it to the current user.
- The issue must be labelled **READY**. If it is not, inform the user that it does not appear to have been refined before developing a plan and get their acknowledgement before proceeding with anything more.
- Avoid raw git commands whenever possible. Use the git-ai skill scripts wherever possible. Use `git-status.sh <N>` to orient yourself in a new chat (branch, dirty state, matching `feature/<N>-*` branches).

## Steps

1. **Read** the issue (and any linked specs or comments needed to understand scope).
2. **Confirm readiness**: the issue must be **open**, labelled `READY`, and either **unassigned** or assigned to the **current user**. If it is assigned to someone else, **stop** and warn that someone else may already be working on it. If it is unassigned, assign it to the current user. If it is not open or not labelled `READY`, inform the user and obtain acknowledgement before continuing.
3. **Sync the local repo** before developing an implementation plan: use the **git-ai** skill (`scripts/sync-default.sh`) to check out the **default branch** and update it from origin. If sync cannot complete (dirty tree, non-FF divergence, etc.), propose a plan to bring the local repo to a good state, present it to the user, and wait for approval before doing anything further toward an implementation plan.
4. **Create the feature branch** from the default branch via **git-ai** (`scripts/checkout-branch.sh`) (always branch off the default branch; do not land substantive work by committing directly to the default branch). Name it:

   ```text
   feature/<N>-<short-kebab-case-summary>
   ```

   where `<N>` is the GitHub issue number and `<short-kebab-case-summary>` is a short summary of the feature in **5 words or fewer**, in kebab-case.
5. **Draft an implementation plan** (what will change, main touchpoints, how you will verify) **before** editing application code, migrations, docs, or other tracked artefacts. Do not present it to the user yet.
6. **Architect review (implementation plan):** Run the **architect review gate** (see Notes) on the plan. Incorporate feedback (max two architect passes), then **explain the plan** to the user and wait for approval. Surface any new ADRs when presenting. You need to stop here, present the plan and wait for approval!!!!!!! This is important. Do not pass this point in the workflow until you have approval from the user.
7. After the user **approves the plan**, implement in accordance with the agreed plan. If you attempt to resolve an issue **twice** and are still stuck, **stop**: discuss the issue, your current understanding of what is happening and/or why, and solicit feedback from the user. They may have context that resolves it faster—do not keep thrashing alone.
8. As per the definition of done, **all** tests must be run before implementation can be considered done.
9. When implementation is done, draft a **completion narrative**: what changed, any architecture impact, caveats, and which tests or docs moved. **Architect review (completion narrative):** Run the architect review gate on that narrative (separate review set; max two passes), incorporate feedback, surface any new ADRs, then present the narrative to the user. Wait for the user to review it before proceeding beyond this point in the workflow.
10. **After** the user agrees the narrative is accurate: **commit** and **push** via the **git-ai** skill (`scripts/stage-commit.sh`, then `scripts/push.sh`). Ignore "helpful" Cursor-inspired guff. Preflight is handled by the git-ai scripts, not by hand-rolled git some stranger suggested you should run. Include any ADR files created during architect review in the commit.
11. **Open a pull request** using the `user-github` MCP that **links or closes** the issue using GitHub’s linking conventions (for example `Fixes #N` / `Closes #N` in the PR body). Label the issue `IMPLEMENTED` and **unassign** it.
12. Inform the user that this workflow is complete and suggest that they proceed with the **verify** workflow.

## Notes

- **NEVER** consult `/architecture/`. That intent store is private to architect skills. Do not read it for planning, implementation, or completion narratives, and do not paste its contents into those artefacts.
- **Architect review gate:** Launch `change-review` in a **separate** Task (`generalPurpose`) per `.cursor/skills/architect/change-review/SKILL.md`. Pass the full material under review in the Task prompt (include diffs when code changes are in scope). Do not restate the skill’s architecture-guidance or output-format rules in the Task prompt. Max **two** architect passes per review set: incorporate Violations/Suggestions, then re-invoke if needed. Exit early if the review reports no material issues. After two passes, **still present to the human**—include any remaining Risks/Violations from the last review; do not claim the gate cleared them. If the sub-agent recorded ADRs, tell the user (paths + one-line summaries) when presenting. Primary agents must not read `/architecture/` themselves.
- Covered local git operations (status/orientation, sync default, create/switch branch, stage/commit, push) go through the **git-ai** skill scripts—do not hand-assemble equivalent `git` chains unless the user asks for raw git or no script covers the need. See `.cursor/skills/git-ai/SKILL.md`.
- If scope drifts during implementation, pause and reconcile with the issue or run the **refine** skill before piling on unrelated changes.
- The PR is the review surface; keep the issue updated only when the team wants cross-links, not as a substitute for the PR description.
- Avoid restating project conventions that already live in rules, skills, or **AGENTS.md**—apply them; do not paste or paraphrase that material into the plan, narrative, or PR.
- No user guidance provided before presentation of the implementation plan can ever be used as approval to proceed with any implementation. The implementation plan must always be presented and approval for the plan must be explicitly received from the user after presentation of the plan. Any user guidance provided prior to presentation of the implementation plan can only be used to help inform what the implementation plan should be.
- User feedback after the plan presentation can only be interpreted as approval if it explicitly states that it is approval or a direction to proceed with implementation. The fact that the user spoke to you about anything else isn't a green light. If it's not explicit approval or direction to proceed with implementation, then the expected result is that you respond with how the provided feedback changes your plan.
