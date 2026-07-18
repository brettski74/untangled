---
name: github-issues
description: >-
  Create or update GitHub issues via the user-github MCP issue_write tool
  (or gh when a workflow skill requires it), including applying labels.
  Use whenever creating, editing, labelling, or otherwise mutating GitHub
  issues — do not wait for an explicit /github-issues invocation.
---

# Create or update GitHub issues

Use this skill whenever you need to **create** or **update** GitHub issues (title, body, labels, assignees, state, etc.). Do not require the user to invoke this skill by name.

## Tooling

1. **Default:** use the **user-github** MCP server with `issue_write` (`method: create` or `update`). Call `GetMcpTools` for schema if needed.
2. **`gh` is installed** in this environment and may be used when a workflow skill explicitly requires it (notably refine finish via git-ai `refine-publish.sh`, which uses `gh issue edit --body-file`).
3. Prefer MCP for ordinary creates/updates, child-issue creation, and labelling outside those scripted finish paths.
4. Large bodies work fine through MCP `issue_write` when you pass the body directly—do **not** invent Python/JSON serializers or assume size limits. For refine, still use `refine-publish.sh` because the draft is already on disk.

Tickets can be labelled via the `labels` array on `issue_write`. The label does not need to already exist. New labels are automatically created when used in the `labels` array.

If the user refers to **github MCP** or similar imprecise names that do not exactly match an installed MCP server, they probably mean **user-github** MCP.

## Anti-patterns

- Do **not** treat `get_label` returning “not found” as “cannot label this issue.” Pass the label name in `issue_write`’s `labels` array anyway.
- Do **not** invent Python/curl/`jq` publish pipelines to “work around” MCP or body size—call MCP directly, or run the workflow’s vetted script when one exists.
- Do **not** bypass `refine-publish.sh` at the end of `/refine` by hand-pasting the draft into MCP.
- Do **not** invent project-specific status/workflow label meanings here (e.g. READY) — those belong in the relevant workflow skills.

## Typical flow

1. Resolve `owner` / `repo` from the git remote or user context.
2. For creates: briefly check for obvious duplicates via user-github search/list tools when practical.
3. `issue_write` with `method: create` or `update`, including `labels` when needed (or the workflow’s `gh` script when specified).
4. Return issue URLs/numbers to the user.
