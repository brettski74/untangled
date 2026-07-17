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
