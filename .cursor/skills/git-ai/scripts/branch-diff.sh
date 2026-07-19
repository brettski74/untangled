#!/usr/bin/env bash
# Read-only topic-vs-default summary (commits + diffstat). Verify-oriented.
# Usage: branch-diff.sh [ref]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin

COMPARE_REF="HEAD"
if [[ $# -gt 1 ]]; then
  cat <<'EOF' >&2
Usage: branch-diff.sh [ref]

Prints commits and diffstat for <ref> (default HEAD) versus origin/<default>.
Uses two-dot log (commits on ref not in base) and three-dot diffstat (merge-base).
Read-only: no fetch, checkout, or index mutation. Prefer this over hand-rolled
git log / git diff during verify; implement usually does not need it.
EOF
  exit 1
fi

if [[ $# -eq 1 ]]; then
  COMPARE_REF="$1"
  if [[ "$COMPARE_REF" == -* ]]; then
    git_ai_die "ref must not start with '-': $COMPARE_REF"
  fi
fi

if ! git rev-parse --verify --quiet "$COMPARE_REF^{commit}" >/dev/null; then
  git_ai_die "cannot resolve compare ref: $COMPARE_REF"
fi

DEFAULT="$(git_ai_default_branch)"
BASE_REF="origin/${DEFAULT}"
if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  git_ai_die "cannot resolve base ref: ${BASE_REF}"
fi

COMMITS_AHEAD="$(git rev-list --count "${BASE_REF}..${COMPARE_REF}" 2>/dev/null || echo "?")"

git_ai_info "repo_root=${REPO_ROOT}"
git_ai_info "default_branch=${DEFAULT}"
git_ai_info "base_ref=${BASE_REF}"
git_ai_info "compare_ref=${COMPARE_REF}"
git_ai_info "commits_ahead=${COMMITS_AHEAD}"

while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  git_ai_info "commit=${line}"
done < <(git log --oneline "${BASE_REF}..${COMPARE_REF}")

# Three-dot: changes introduced on compare_ref since merge-base with base.
# Last line of --stat is the summary ("N files changed, ..."); emit as diff_summary.
diff_lines=()
while IFS= read -r line; do
  diff_lines+=("$line")
done < <(git diff --stat "${BASE_REF}...${COMPARE_REF}")

if [[ ${#diff_lines[@]} -gt 0 ]]; then
  last_idx=$((${#diff_lines[@]} - 1))
  summary="${diff_lines[$last_idx]}"
  # Summary lines look like " 2 files changed, ..." — treat that as diff_summary.
  if [[ "$summary" =~ files?\ changed ]]; then
    for ((i = 0; i < last_idx; i++)); do
      [[ -n "${diff_lines[$i]}" ]] || continue
      git_ai_info "diff_stat=${diff_lines[$i]}"
    done
    git_ai_info "diff_summary=${summary}"
  else
    for line in "${diff_lines[@]}"; do
      [[ -n "$line" ]] || continue
      git_ai_info "diff_stat=${line}"
    done
  fi
fi

exit 0
