#!/usr/bin/env bash
# Push the current non-default branch to origin. Never force. FF-only integrate when behind.
# Usage: push.sh [--remote <name>]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

REMOTE="origin"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      [[ $# -ge 2 ]] || git_ai_die "--remote requires a name"
      REMOTE="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: push.sh [--remote origin]

Push the current branch. Refuses default branch and detached HEAD.
Never force-pushes. If behind upstream and FF-capable, pull --ff-only then push.
EOF
      exit 0
      ;;
    *)
      git_ai_die "unknown argument: $1"
      ;;
  esac
done

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  git_ai_die "remote '${REMOTE}' does not exist"
fi

DEFAULT="$(git_ai_default_branch)"
BRANCH="$(git_ai_current_branch)"

if [[ "$BRANCH" == "$DEFAULT" ]]; then
  git_ai_die "refusing to push default branch '${DEFAULT}' via push.sh — use a topic branch"
fi

git fetch "$REMOTE"

UPSTREAM=""
if UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  :
else
  UPSTREAM=""
fi

if [[ -z "$UPSTREAM" ]]; then
  git_ai_info "no upstream; pushing -u ${REMOTE} HEAD"
  if ! git push -u "$REMOTE" HEAD; then
    git_ai_die "git push -u failed (check auth/network)"
  fi
  git_ai_print_status_short
  exit 0
fi

# Behind / diverge relative to upstream
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$UPSTREAM")"
if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  git_ai_info "already up to date with ${UPSTREAM}; pushing anyway (idempotent)"
elif git merge-base --is-ancestor HEAD "$UPSTREAM"; then
  # Local is behind: FF-only pull
  git_ai_info "local is behind ${UPSTREAM}; integrating with pull --ff-only"
  if ! git pull --ff-only; then
    echo "error: pull --ff-only failed" >&2
    git_ai_print_divergence HEAD "$UPSTREAM" >&2
    exit 1
  fi
elif git merge-base --is-ancestor "$UPSTREAM" HEAD; then
  # Local is ahead only — push below
  :
else
  echo "error: local and ${UPSTREAM} have diverged; refusing automatic rebase/merge" >&2
  git_ai_print_divergence HEAD "$UPSTREAM" >&2
  exit 1
fi

if ! git push; then
  git_ai_die "git push failed (check auth/network or remote rejection)"
fi

git_ai_info "pushed ${BRANCH} -> ${UPSTREAM}"
git_ai_print_status_short
exit 0
