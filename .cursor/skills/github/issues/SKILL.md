---
name: github-issues
description: >-
  Create or update GitHub issues via the user-github MCP issue_write tool,
  including applying labels. Use whenever creating, editing, labelling,
  or otherwise mutating GitHub issues — do not wait for an explicit
  /github-issues invocation. Prefer user-github MCP over the GitHub CLI.
---

# Create or update GitHub issues

Use this skill whenever you need to **create** or **update** GitHub issues (title, body, labels, assignees, state, etc.). Do not require the user to invoke this skill by name.

## Tooling (required)

1. Use the **user-github** MCP server.
2. Call `GetMcpTools` for `user-github` / `issue_write` before `CallMcpTool` if you do not already have the current schema.
3. Mutate issues with `issue_write` (`method: create` or `method: update`).
4. Prefer user-github MCP for all issue creates/updates in scope of this skill.

Tickets can be labelled via the `labels` array. The label does not need to already exist. New labels are automatically created when used in the `labels` array. Never use GitHub CLI unless the user explicitly tells you that it's installed. If the user has not told you that, then assume it is not installed and will not work. **user-github** MCP is the preferred way to do this.

If the user refers to **github MCP** or similar imprecise names that do not exactly match an installed MCP server, they probably mean **user-github** MCP.

## Anti-patterns

- Do **not** treat `get_label` returning “not found” as “cannot label this issue.” Pass the label name in `issue_write`’s `labels` array anyway.
- Do **not** probe for `gh`, `GITHUB_TOKEN`, or curl workarounds when user-github MCP is available.
- Do **not** use the GitHub CLI unless the user has explicitly said it is installed.
- Do **not** invent project-specific status/workflow label meanings here (e.g. READY) — those belong in the relevant workflow skills.

## Typical flow

1. Resolve `owner` / `repo` from the git remote or user context.
2. For creates: briefly check for obvious duplicates via user-github search/list tools when practical.
3. `issue_write` with `method: create` or `update`, including `labels` when needed.
4. Return issue URLs/numbers to the user.
