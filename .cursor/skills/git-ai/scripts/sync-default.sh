#!/usr/bin/env bash
# Sync the default branch from origin (FF-only); optionally delete a local topic branch.
# Usage: sync-default.sh [--delete-branch <name>]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

DELETE_BRANCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --delete-branch)
      [[ $# -ge 2 ]] || git_ai_die "--delete-branch requires a branch name"
      DELETE_BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: sync-default.sh [--delete-branch <local-branch>]

Check out the default branch, fast-forward from origin, optionally delete a
local topic branch when squash-aware safety checks pass.
EOF
      exit 0
      ;;
    *)
      git_ai_die "unknown argument: $1"
      ;;
  esac
done

git fetch origin --prune

DEFAULT="$(git_ai_default_branch)"
CURRENT="$(git symbolic-ref -q --short HEAD 2>/dev/null || true)"

if [[ "$CURRENT" != "$DEFAULT" ]]; then
  if git_ai_tracked_dirty; then
    echo "error: working tree/index has tracked changes that may block checkout to ${DEFAULT}" >&2
    git_ai_print_status >&2
    exit 1
  fi
  if ! git checkout "$DEFAULT"; then
    echo "error: failed to checkout ${DEFAULT}" >&2
    git_ai_print_status >&2
    exit 1
  fi
  git_ai_info "checked out ${DEFAULT}"
else
  git_ai_info "already on ${DEFAULT}"
fi

if ! git merge --ff-only "origin/${DEFAULT}"; then
  echo "error: cannot fast-forward ${DEFAULT} to origin/${DEFAULT}" >&2
  git_ai_print_divergence "$DEFAULT" "origin/${DEFAULT}" >&2
  exit 1
fi

HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse "origin/${DEFAULT}")"
git_ai_info "synced ${DEFAULT}"
git_ai_info "HEAD=${HEAD_SHA}"
if [[ "$HEAD_SHA" == "$ORIGIN_SHA" ]]; then
  git_ai_info "matches origin/${DEFAULT}"
else
  git_ai_info "WARNING: does not match origin/${DEFAULT} (${ORIGIN_SHA})"
fi
git_ai_print_status_short

if [[ -z "$DELETE_BRANCH" ]]; then
  exit 0
fi

# --- optional local branch delete ---
if [[ "$DELETE_BRANCH" == "$DEFAULT" ]]; then
  git_ai_die "refusing to delete default branch '${DEFAULT}'"
fi
if [[ "$(git symbolic-ref -q --short HEAD)" == "$DELETE_BRANCH" ]]; then
  git_ai_die "refusing to delete the currently checked-out branch '${DELETE_BRANCH}'"
fi

if ! git show-ref --verify --quiet "refs/heads/${DELETE_BRANCH}"; then
  git_ai_info "already deleted: local branch '${DELETE_BRANCH}' does not exist"
  exit 0
fi

# Hard gate: unpushed local commits
if git show-ref --verify --quiet "refs/remotes/origin/${DELETE_BRANCH}"; then
  UNPUSHED="$(git rev-list --count "origin/${DELETE_BRANCH}..${DELETE_BRANCH}")"
  if [[ "$UNPUSHED" -gt 0 ]]; then
    echo "error: local branch '${DELETE_BRANCH}' has ${UNPUSHED} commit(s) not on origin/${DELETE_BRANCH}; refusing delete" >&2
    git log --oneline "origin/${DELETE_BRANCH}..${DELETE_BRANCH}" >&2
    exit 1
  fi
else
  # Remote-tracking ref gone after prune: abort unless tip is ancestor of default
  # or tree-equivalent to default (no unexplained local-only work).
  if ! git merge-base --is-ancestor "$DELETE_BRANCH" "$DEFAULT" \
    && ! git diff --quiet "$DELETE_BRANCH" "$DEFAULT"; then
    echo "error: origin/${DELETE_BRANCH} is gone and local tip is neither an ancestor of nor tree-equivalent to ${DEFAULT}; refusing delete" >&2
    echo "commits on ${DELETE_BRANCH} not in ${DEFAULT}:" >&2
    git log --oneline "${DEFAULT}..${DELETE_BRANCH}" >&2
    exit 1
  fi
fi

ALLOW_REASON=""
if git merge-base --is-ancestor "$DELETE_BRANCH" "$DEFAULT"; then
  ALLOW_REASON="ancestry"
elif git diff --quiet "$DELETE_BRANCH" "$DEFAULT"; then
  ALLOW_REASON="tree-equivalent"
elif git_ai_gh_merged_pr "$DELETE_BRANCH" "$DEFAULT"; then
  ALLOW_REASON="gh-merged-pr"
else
  echo "error: refusing to delete '${DELETE_BRANCH}': not an ancestor of ${DEFAULT}, trees differ, and no merged PR found via gh" >&2
  git_ai_print_divergence "$DELETE_BRANCH" "$DEFAULT" >&2
  exit 1
fi

if git branch -d "$DELETE_BRANCH" 2>/dev/null; then
  git_ai_info "deleted local branch '${DELETE_BRANCH}' (predicate=${ALLOW_REASON})"
elif [[ "$ALLOW_REASON" == "ancestry" ]]; then
  echo "error: git branch -d refused '${DELETE_BRANCH}' despite ancestry predicate" >&2
  exit 1
else
  # Squash / tree-eq / merged-PR: -d may refuse; allow -D only after a non-ancestry
  # predicate already passed (never blind -D).
  git branch -D "$DELETE_BRANCH"
  git_ai_info "deleted local branch '${DELETE_BRANCH}' with -D (predicate=${ALLOW_REASON}; -d refused)"
fi

exit 0
