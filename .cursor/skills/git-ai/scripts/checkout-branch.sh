#!/usr/bin/env bash
# Create or switch to a named branch.
# Usage: checkout-branch.sh <branch-name>
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

if [[ $# -lt 1 ]]; then
  cat <<'EOF' >&2
Usage: checkout-branch.sh <branch-name>

Existing local or origin/<branch>: check out as-is (no base validation).
Brand-new branch: create only off an up-to-date default branch.
EOF
  exit 1
fi

BRANCH="$1"
if [[ "$BRANCH" == -* ]]; then
  git_ai_die "branch name must not start with '-': $BRANCH"
fi
shift
[[ $# -eq 0 ]] || git_ai_die "unexpected extra arguments: $*"

git fetch origin --prune

DEFAULT="$(git_ai_default_branch)"
CURRENT="$(git symbolic-ref -q --short HEAD 2>/dev/null || echo "")"

if [[ "$CURRENT" == "$BRANCH" ]]; then
  git_ai_info "already on ${BRANCH}"
  git_ai_print_status_short
  exit 0
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  if ! git checkout "$BRANCH"; then
    echo "error: failed to checkout local branch '${BRANCH}'" >&2
    git_ai_print_status >&2
    exit 1
  fi
  git_ai_info "checked out existing local branch ${BRANCH}"
  git_ai_print_status_short
  exit 0
fi

if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
  if ! git checkout -b "$BRANCH" --track "origin/${BRANCH}"; then
    echo "error: failed to create tracking branch for origin/${BRANCH}" >&2
    git_ai_print_status >&2
    exit 1
  fi
  git_ai_info "created local tracking branch ${BRANCH} from origin/${BRANCH}"
  git_ai_print_status_short
  exit 0
fi

# Brand-new: only off up-to-date default
if [[ "$CURRENT" != "$DEFAULT" ]]; then
  git_ai_die "cannot create brand-new branch '${BRANCH}': current branch is '${CURRENT:-detached}', not default '${DEFAULT}'. Run sync-default.sh first and stay on ${DEFAULT}."
fi

LOCAL_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse "origin/${DEFAULT}")"
if [[ "$LOCAL_SHA" != "$ORIGIN_SHA" ]]; then
  echo "error: cannot create brand-new branch '${BRANCH}': default '${DEFAULT}' is not FF-equal to origin/${DEFAULT}" >&2
  git_ai_print_divergence "$DEFAULT" "origin/${DEFAULT}" >&2
  echo "Run sync-default.sh first." >&2
  exit 1
fi

if git_ai_tracked_dirty; then
  echo "error: tracked changes present; refusing to create branch '${BRANCH}'" >&2
  git_ai_print_status >&2
  exit 1
fi

git checkout -b "$BRANCH"
git_ai_info "created branch ${BRANCH} from up-to-date ${DEFAULT}"
git_ai_print_status_short
exit 0
