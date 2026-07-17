#!/usr/bin/env bash
# Mechanical start-of-refinement setup for the refine workflow.
# Usage: refine-preflight.sh <issue-number>
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

if [[ $# -ne 1 ]]; then
  cat <<'EOF' >&2
Usage: refine-preflight.sh <issue-number>

Ensures .refinement/ exists and prints repo/origin/draft facts for refine.
Never creates or modifies the draft file itself.
EOF
  exit 1
fi

ISSUE="$1"
if [[ ! "$ISSUE" =~ ^[0-9]+$ ]] || (( 10#$ISSUE <= 0 )); then
  git_ai_die "issue number must be a positive integer: $ISSUE"
fi

mkdir -p .refinement

ORIGIN_URL="$(git remote get-url origin)"
DRAFT_PATH=".refinement/${ISSUE}-draft.md"
if [[ -f "$DRAFT_PATH" ]]; then
  DRAFT_EXISTS="yes"
else
  DRAFT_EXISTS="no"
fi

git_ai_info "repo_root=${REPO_ROOT}"
git_ai_info "origin_url=${ORIGIN_URL}"
git_ai_info "issue_number=${ISSUE}"
git_ai_info "draft_path=${DRAFT_PATH}"
git_ai_info "draft_exists=${DRAFT_EXISTS}"
exit 0
