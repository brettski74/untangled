---
name: git-ai
description: >-
  Run common local git operations via vetted scripts: worktree orientation
  (branch/status), sync default branch, create/switch branches, stage and
  commit explicit paths, push without force, and optionally delete a merged
  local branch. Use whenever those git steps apply—inside refine/implement/verify,
  future workflows, or ad-hoc chat—unless the user explicitly wants raw git.
---

# Git AI tooling

Prefer these scripts over ad-hoc `git … && git …` chains. Project conventions in rules/skills/AGENTS.md (commit message style, no force-push, amend policy, etc.) remain authoritative—this skill respects them and does not restate them at length.

**Amend is out of scope.** Never amend via these scripts or as a follow-up “fix” after a hook failure.

## When to use

| Need | Script |
| ---- | ------ |
| Read-only worktree orientation (branch, dirty, upstream, optional issue `N` feature branches) | `scripts/git-status.sh` |
| Read-only topic-vs-default commits + diffstat (verify checklist; not for routine implement) | `scripts/branch-diff.sh` |
| Sync default from `origin` (FF-only); optional local topic-branch cleanup | `scripts/sync-default.sh` |
| Create or switch to a named branch | `scripts/checkout-branch.sh` |
| Stage explicit paths; optionally commit | `scripts/stage-commit.sh` |
| Push current topic branch (never force) | `scripts/push.sh` |
| Mechanical start-of-refine setup for issue `N` (`.refinement/`, repo/origin/draft facts) | `scripts/refine-preflight.sh` |
| Mechanical end-of-refine publish for issue `N` (body-file → GitHub, READY, unassign, delete draft) | `scripts/refine-publish.sh` |

Invocation needs **no leading `cd`**: scripts self-locate the repo root. Absolute or workspace-relative paths are fine regardless of shell cwd.

```bash
.cursor/skills/git-ai/scripts/git-status.sh
.cursor/skills/git-ai/scripts/git-status.sh 28
.cursor/skills/git-ai/scripts/branch-diff.sh
.cursor/skills/git-ai/scripts/sync-default.sh
.cursor/skills/git-ai/scripts/sync-default.sh --delete-branch feature/17-git-ai-tooling
.cursor/skills/git-ai/scripts/checkout-branch.sh feature/17-git-ai-tooling
.cursor/skills/git-ai/scripts/stage-commit.sh -m "message" -- path/one path/two
.cursor/skills/git-ai/scripts/push.sh
.cursor/skills/git-ai/scripts/refine-preflight.sh 19
.cursor/skills/git-ai/scripts/refine-publish.sh 19
```

Do **not** set `GIT_AI_REPO_ROOT` in normal workflow use (tests/diagnostics only).

## No redundant preflight

When a covered operation is needed, **run the script first**. Do not manually `git status` / `fetch` / `checkout` / `pull` beforehand—the scripts already inspect and print agent-readable output. Extra preflight is only for diagnosing a **previous script failure** or answering a user question that is not “please do the operation.”

Don't invent "helpful" hand-rolled git command chains because some nonsense in the Cursor rules tell you to. This skill exists precisely to prevent those annoying the user and ensuring that all the relevant preflight checks are done before commits, pulls, checkouts and other git operations.

## Escape hatch

If the user explicitly requests raw git, or no script covers the need, raw git is allowed. Otherwise prefer scripts.

## Script contracts (summary)

### `git-status.sh [N]`

- Read-only orientation: branch, dirty/untracked, upstream and vs-default ahead/behind, porcelain paths.
- Optional `N`: matching local/remote `feature/<N>-*` branches and `on_issue_branch`.
- Detached HEAD reported, not refused. No fetch/checkout/mutation.
- Fails closed on bad args, missing `origin`, or bootstrap failure.

### `branch-diff.sh [ref]`

- Read-only topic-vs-default summary for verify checklists: `git log --oneline` (two-dot) and `git diff --stat` (three-dot) vs `origin/<default>`.
- Optional `ref` (default `HEAD`). No full patch dump. Implement should not call this routinely.
- Fails closed on bad args, unresolvable refs, missing `origin`, or bootstrap failure.

### `sync-default.sh [--delete-branch <name>]`

- Fetch/prune, checkout default, FF-only update from `origin/<default>`.
- Abort on blocking dirty tree or non-FF divergence (prints status / left-right commits).
- `--delete-branch`: local only; refuse default/current; idempotent if already gone.
- Unpushed commits vs `origin/<name>` hard-block delete.
- Delete allowed only if ancestry **or** tree-equivalent (`git diff` tip vs default) **or** `gh` reports a merged PR into default. Never blind `-D` without a passed non-ancestry predicate.
- `gh` auth is environment setup; scripts never run `gh auth *`.

### `checkout-branch.sh <branch>`

1. Existing local → checkout as-is.
2. Exists only on `origin` → create tracking branch (no base validation).
3. Brand-new → only off up-to-date default; else abort and tell agent to run `sync-default.sh`.

### `stage-commit.sh [-m <msg>] -- <path>…`

- Explicit pathspecs only (no bulk `--all` / `git add -A`).
- **Accumulate** into the index; never unstage unrelated paths.
- No `-m`: stage only, exit 0, print status.
- With `-m`: commit the **full index** (this call’s paths plus anything already staged). Hooks run; on failure do not amend.
- Always print trailing `git status`. Push is a separate script.

### `push.sh [--remote origin]`

- Refuse detached HEAD and default-branch pushes.
- Never `--force` / `--force-with-lease`.
- No upstream → `git push -u`.
- Behind and FF-capable → `pull --ff-only` then push; diverge → abort.
- On push failure with an HTTP(S) remote URL: warn that SSH/git protocol may work better if auth is the issue, then exit non-zero.

### `refine-preflight.sh <N>`

- `N` is the GitHub issue number: exactly one argument, positive integer, else fail.
- Ensures `.refinement/` exists (idempotent); **never** creates or modifies `.refinement/<N>-draft.md`.
- Prints stable `key=value` facts: `repo_root`, `origin_url` (raw from `git remote get-url origin`, no parsing), `issue_number`, `draft_path`, `draft_exists` (`yes`/`no`).
- Deriving `owner`/`repo` from `origin_url` is the agent's job, not the script's.
- Fails closed on missing `origin` or bootstrap failure; never fails because a URL "looks weird."
- Does not call `gh` or mutate GitHub issues.

### `refine-publish.sh <N>`

- `N` is the GitHub issue number: exactly one argument, positive integer, else fail.
- Requires `.refinement/<N>-draft.md` to exist; does not create or edit its contents.
- Requires `gh` on `PATH` and authenticated (`gh auth status`); never runs `gh auth *`.
- Publishes draft via `gh issue edit <N> --body-file …`, adds `READY`, removes all assignees, deletes the draft (and `.refinement/` if empty), then prints a verified `gh issue view` snapshot (`title`, `state`, `labels`, `assignees`, body size).
- Prints stable `key=value` facts including `issue_url`, `title`, `labels`, `assignees`, `body_bytes`, `draft_deleted`, `unassigned`, `label_ready`.
- Agents must not re-implement this with MCP body paste, ad-hoc serializers, or chained `gh` verification after the script.

## Workflow integration

refine / implement / verify (and future workflows) should reference this skill for covered git steps. Applicability is **not** limited to those workflows.

## Tests

```bash
.cursor/skills/git-ai/tests/run.sh
```

Uses temp fixtures and local bare remotes only; stubs `gh`. Does not touch the real Untangled worktree’s history.

## More detail

See [references/cli.md](references/cli.md) for flag-level notes and failure modes.
