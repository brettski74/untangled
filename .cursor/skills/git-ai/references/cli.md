# git-ai CLI notes

## Bootstrap

Every script sources `scripts/common.sh`, which:

1. Uses `GIT_AI_REPO_ROOT` if set (must be a git work tree).
2. Otherwise resolves the work tree from the script path via `git -C "$SCRIPT_DIR" rev-parse --show-toplevel`.
3. `cd`s to that root.

Agents should invoke scripts by path with no leading `cd`.

## `sync-default.sh`

| Arg | Meaning |
| --- | ------- |
| `--delete-branch <name>` | After successful sync, delete local `<name>` if safety predicates pass |

Failure modes (non-zero):

- No `origin` / unresolved `origin/HEAD`
- Tracked dirty blocks checkout to default
- Default not fast-forwardable to `origin/<default>`
- Delete: unpushed commits; none of ancestry / tree-eq / merged PR; deleting default or current branch

Idempotent success:

- Already on up-to-date default
- Delete requested but local branch already absent

`gh` is consulted only when ancestry and tree-eq both fail for `--delete-branch`. Requires `gh` on `PATH` and existing credentials (`gh auth status`). Scripts never run `gh auth login` / refresh.

Merged-PR probe:

```bash
gh pr list --head <branch> --base <default> --state merged --limit 1 --json number --jq 'length'
```

## `checkout-branch.sh`

| Arg | Meaning |
| --- | ------- |
| `<branch>` | Full local branch name (no `feature/` enforcement) |

Precedence: local → `origin/<branch>` tracking → brand-new off up-to-date default only.

## `stage-commit.sh`

| Arg | Meaning |
| --- | ------- |
| `-m` / `--message <text>` | Commit full index after staging listed paths |
| `-- <path>…` | Explicit pathspecs (required; at least one) |

Refuse: zero pathspecs; bulk flags (`--all`, `-A`, `-u`); bulk pathspecs like `.` / `:/`.

Stage-only (no `-m`) exits 0. Commit with empty index after add exits non-zero.

## `push.sh`

| Arg | Meaning |
| --- | ------- |
| `--remote <name>` | Remote name (default `origin`) |

Refuse: default branch, detached HEAD, non-FF divergence. Never force.

On `git push` failure: if the remote URL is `http://` or `https://`, print a warning suggesting SSH/git protocol may work better when HTTPS credentials are not configured, then exit non-zero.

## `git-status.sh`

| Arg | Meaning |
| --- | ------- |
| `[issue-number]` | Optional GitHub issue number `N` (positive integer). When set, also reports matching `feature/<N>-*` branches. |

Behaviour:

- Standard bootstrap (`common.sh`), requires `origin`.
- **Read-only:** no fetch, checkout, or index mutation. Detached HEAD is reported (`head_detached=yes`), not a hard failure.
- Success output (stable `key=value` lines): `repo_root`, `origin_url` (raw), `default_branch`, `current_branch`, `head_detached`, `on_default`, `tracked_dirty`, `has_untracked`, `upstream` (empty if none), `upstream_ahead` / `upstream_behind` (empty if no upstream), `default_ahead` / `default_behind` vs `origin/<default>`, `status_sb` (first line of `git status -sb`), zero or more `status_path=<porcelain line>`.
- With `N`: also `issue_number`, `issue_branch_local` / `issue_branch_remote` (comma-separated `feature/<N>-*` matches, may be empty), `on_issue_branch`.

Failure modes (non-zero):

- Extra args; non-integer or non-positive `N`
- Not inside a git work tree / bootstrap failure
- No `origin` remote

Intended for implement/verify orientation instead of hand-rolled `git branch` / `git status` chains.

## `branch-diff.sh`

| Arg | Meaning |
| --- | ------- |
| `[ref]` | Optional compare tip (default `HEAD`). Must resolve to a commit. |

Behaviour:

- Standard bootstrap (`common.sh`), requires `origin`.
- **Read-only:** no fetch, checkout, or index mutation.
- Base is always `origin/<default>` (not local default, which may be stale).
- Commits: two-dot `git log --oneline origin/<default>..<ref>`.
- Diffstat: three-dot `git diff --stat origin/<default>...<ref>` (merge-base); per-file lines as `diff_stat=`, summary as `diff_summary=`.
- Success output (stable `key=value` lines): `repo_root`, `default_branch`, `base_ref`, `compare_ref`, `commits_ahead`, zero or more `commit=<oneline>`, zero or more `diff_stat=…`, optional `diff_summary=…`.

Failure modes (non-zero):

- Extra args; ref starting with `-`; unresolvable compare or base ref
- Not inside a git work tree / bootstrap failure
- No `origin` remote

**Verify** uses this to build the acceptance checklist from code changes. **Implement** should not call it routinely (keeps large diffstat out of implement context). Prefer this over hand-rolled `git log` / `git diff`.

## `refine-preflight.sh`

| Arg | Meaning |
| --- | ------- |
| `<issue-number>` | GitHub issue number `N` (exactly one argument; positive integer) |

Behaviour:

- Standard bootstrap (`common.sh`), requires `origin`.
- `mkdir -p .refinement` (idempotent; existing drafts untouched).
- Success output (stable `key=value` lines): `repo_root`, `origin_url` (raw, unparsed), `issue_number`, `draft_path` (`.refinement/<N>-draft.md`), `draft_exists` (`yes`/`no`).

Failure modes (non-zero):

- Missing, extra, non-integer, or non-positive `N`
- Not inside a git work tree / bootstrap failure
- No `origin` remote

Owner/repo parsing from `origin_url` is deliberately left to the agent.

## `refine-publish.sh`

| Arg | Meaning |
| --- | ------- |
| `<issue-number>` | GitHub issue number `N` (exactly one argument; positive integer) |

Behaviour:

- Standard bootstrap (`common.sh`), requires `origin` and authenticated `gh`.
- Requires `.refinement/<N>-draft.md`; never creates or rewrites draft content.
- `gh issue edit <N> --body-file .refinement/<N>-draft.md`
- `gh issue edit <N> --add-label READY`
- Removes every current assignee via `gh issue edit --remove-assignee`
- Deletes the draft; removes `.refinement/` only if empty afterward
- Success output (stable `key=value` lines): `repo_root`, `issue_number`, `issue_url`, `title`, `state`, `labels`, `assignees` (post-unassign), `draft_path`, `draft_bytes`, `draft_lines`, `body_bytes`, `body_lines`, `draft_deleted`, `refinement_dir_removed`, `unassigned`, `label_ready` (verified from issue after edits)

Failure modes (non-zero):

- Missing, extra, non-integer, or non-positive `N`
- Missing draft file
- Missing `origin` / bootstrap failure
- `gh` missing or not authenticated
- Any `gh issue edit` / `gh issue view` failure

Does not create child issues or perform refine judgment (feature vs bug, READY confirmation)—workflow skill only.
