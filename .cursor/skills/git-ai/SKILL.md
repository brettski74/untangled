---
name: git-ai
description: >-
  Run common local git operations via vetted scripts: sync default branch,
  create/switch branches, stage and commit explicit paths, push without force,
  and optionally delete a merged local branch. Use whenever those git steps
  apply—inside refine/implement/verify, future workflows, or ad-hoc chat—unless
  the user explicitly wants raw git.
---

# Git AI tooling

Prefer these scripts over ad-hoc `git … && git …` chains. Project conventions in rules/skills/AGENTS.md (commit message style, no force-push, amend policy, etc.) remain authoritative—this skill respects them and does not restate them at length.

**Amend is out of scope.** Never amend via these scripts or as a follow-up “fix” after a hook failure.

## When to use

| Need | Script |
| ---- | ------ |
| Sync default from `origin` (FF-only); optional local topic-branch cleanup | `scripts/sync-default.sh` |
| Create or switch to a named branch | `scripts/checkout-branch.sh` |
| Stage explicit paths; optionally commit | `scripts/stage-commit.sh` |
| Push current topic branch (never force) | `scripts/push.sh` |

Invocation needs **no leading `cd`**: scripts self-locate the repo root. Absolute or workspace-relative paths are fine regardless of shell cwd.

```bash
.cursor/skills/git-ai/scripts/sync-default.sh
.cursor/skills/git-ai/scripts/sync-default.sh --delete-branch feature/17-git-ai-tooling
.cursor/skills/git-ai/scripts/checkout-branch.sh feature/17-git-ai-tooling
.cursor/skills/git-ai/scripts/stage-commit.sh -m "message" -- path/one path/two
.cursor/skills/git-ai/scripts/push.sh
```

Do **not** set `GIT_AI_REPO_ROOT` in normal workflow use (tests/diagnostics only).

## No redundant preflight

When a covered operation is needed, **run the script first**. Do not manually `git status` / `fetch` / `checkout` / `pull` beforehand—the scripts already inspect and print agent-readable output. Extra preflight is only for diagnosing a **previous script failure** or answering a user question that is not “please do the operation.”

## Escape hatch

If the user explicitly requests raw git, or no script covers the need, raw git is allowed. Otherwise prefer scripts.

## Script contracts (summary)

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

## Workflow integration

refine / implement / verify (and future workflows) should reference this skill for covered git steps. Applicability is **not** limited to those workflows.

## Tests

```bash
.cursor/skills/git-ai/tests/run.sh
```

Uses temp fixtures and local bare remotes only; stubs `gh`. Does not touch the real Untangled worktree’s history.

## More detail

See [references/cli.md](references/cli.md) for flag-level notes and failure modes.
