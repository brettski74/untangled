#!/usr/bin/env bash
# Read-only workspace orientation for implement/verify (and ad-hoc use).
# Usage: git-status.sh [issue-number]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

ISSUE=""
if [[ $# -gt 1 ]]; then
  cat <<'EOF' >&2
Usage: git-status.sh [issue-number]

Prints stable key=value facts about the current worktree (branch, dirty state,
upstream, issue-matching feature branches). Read-only: no fetch, checkout, or
index mutation.
EOF
  exit 1
fi

if [[ $# -eq 1 ]]; then
  ISSUE="$1"
  if [[ ! "$ISSUE" =~ ^[0-9]+$ ]] || (( 10#$ISSUE <= 0 )); then
    git_ai_die "issue number must be a positive integer: $ISSUE"
  fi
fi

ORIGIN_URL="$(git remote get-url origin)"
DEFAULT="$(git_ai_default_branch)"

CURRENT=""
HEAD_DETACHED="no"
if CURRENT="$(git symbolic-ref -q --short HEAD 2>/dev/null)"; then
  :
else
  HEAD_DETACHED="yes"
  CURRENT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
fi

ON_DEFAULT="no"
if [[ "$HEAD_DETACHED" == "no" && "$CURRENT" == "$DEFAULT" ]]; then
  ON_DEFAULT="yes"
fi

TRACKED_DIRTY="no"
if git_ai_tracked_dirty; then
  TRACKED_DIRTY="yes"
fi

HAS_UNTRACKED="no"
if git status --porcelain | grep -q '^??'; then
  HAS_UNTRACKED="yes"
fi

UPSTREAM=""
UPSTREAM_AHEAD=""
UPSTREAM_BEHIND=""
if [[ "$HEAD_DETACHED" == "no" ]]; then
  if UPSTREAM="$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)"; then
    UPSTREAM_AHEAD="$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")"
    UPSTREAM_BEHIND="$(git rev-list --count "HEAD..@{u}" 2>/dev/null || echo "?")"
  else
    UPSTREAM=""
    UPSTREAM_AHEAD=""
    UPSTREAM_BEHIND=""
  fi
fi

DEFAULT_AHEAD=""
DEFAULT_BEHIND=""
if git rev-parse --verify --quiet "origin/${DEFAULT}" >/dev/null; then
  DEFAULT_AHEAD="$(git rev-list --count "origin/${DEFAULT}..HEAD" 2>/dev/null || echo "?")"
  DEFAULT_BEHIND="$(git rev-list --count "HEAD..origin/${DEFAULT}" 2>/dev/null || echo "?")"
fi

# First line of status -sb (branch tracking summary); path lines as status_path=
STATUS_SB=""
{
  IFS= read -r STATUS_SB || true
} < <(git status -sb)

git_ai_info "repo_root=${REPO_ROOT}"
git_ai_info "origin_url=${ORIGIN_URL}"
git_ai_info "default_branch=${DEFAULT}"
git_ai_info "current_branch=${CURRENT}"
git_ai_info "head_detached=${HEAD_DETACHED}"
git_ai_info "on_default=${ON_DEFAULT}"
git_ai_info "tracked_dirty=${TRACKED_DIRTY}"
git_ai_info "has_untracked=${HAS_UNTRACKED}"
git_ai_info "upstream=${UPSTREAM}"
git_ai_info "upstream_ahead=${UPSTREAM_AHEAD}"
git_ai_info "upstream_behind=${UPSTREAM_BEHIND}"
git_ai_info "default_ahead=${DEFAULT_AHEAD}"
git_ai_info "default_behind=${DEFAULT_BEHIND}"
git_ai_info "status_sb=${STATUS_SB}"

# Path lines from porcelain (stable, one path per line; status codes preserved)
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  git_ai_info "status_path=${line}"
done < <(git status --porcelain)

if [[ -n "$ISSUE" ]]; then
  # Collect feature/<N>-* local and remote branch names (comma-separated, sorted).
  local_matches=()
  remote_matches=()
  while IFS= read -r ref; do
    [[ -n "$ref" ]] || continue
    local_matches+=("${ref#refs/heads/}")
  done < <(git for-each-ref --format='%(refname)' "refs/heads/feature/${ISSUE}-*" | sort)

  while IFS= read -r ref; do
    [[ -n "$ref" ]] || continue
    # Strip refs/remotes/ → origin/feature/...
    remote_matches+=("${ref#refs/remotes/}")
  done < <(git for-each-ref --format='%(refname)' "refs/remotes/origin/feature/${ISSUE}-*" | sort)

  local_joined=""
  remote_joined=""
  if [[ ${#local_matches[@]} -gt 0 ]]; then
    local_joined="$(IFS=,; echo "${local_matches[*]}")"
  fi
  if [[ ${#remote_matches[@]} -gt 0 ]]; then
    remote_joined="$(IFS=,; echo "${remote_matches[*]}")"
  fi

  ON_ISSUE_BRANCH="no"
  if [[ "$HEAD_DETACHED" == "no" ]]; then
    for b in "${local_matches[@]+"${local_matches[@]}"}"; do
      if [[ "$CURRENT" == "$b" ]]; then
        ON_ISSUE_BRANCH="yes"
        break
      fi
    done
  fi

  git_ai_info "issue_number=${ISSUE}"
  git_ai_info "issue_branch_local=${local_joined}"
  git_ai_info "issue_branch_remote=${remote_joined}"
  git_ai_info "on_issue_branch=${ON_ISSUE_BRANCH}"
fi

exit 0
