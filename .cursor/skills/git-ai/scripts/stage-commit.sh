#!/usr/bin/env bash
# Stage explicit pathspecs; optionally commit the full index (never amend).
# Usage: stage-commit.sh [-m <message>] -- <path> [path ...]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap

MESSAGE=""
PATHS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      [[ $# -ge 2 ]] || git_ai_die "$1 requires a message"
      MESSAGE="$2"
      shift 2
      ;;
    --)
      shift
      PATHS+=("$@")
      break
      ;;
    -h|--help)
      cat <<'EOF'
Usage: stage-commit.sh [-m <message>] -- <path> [path ...]

Stage only the listed pathspecs (accumulate; never unstage other paths).
Without -m: stage only and exit 0.
With -m: commit the full index (newly staged + already staged). Never amends.
EOF
      exit 0
      ;;
    --all|-A|-u|--update)
      git_ai_die "bulk staging flags are not allowed; list explicit pathspecs after --"
      ;;
    -*)
      git_ai_die "unknown option: $1"
      ;;
    *)
      # Allow paths without -- for convenience, but still require explicit list.
      PATHS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#PATHS[@]} -eq 0 ]]; then
  git_ai_die "at least one pathspec is required (after optional -m / --)"
fi

# Refuse accidental bulk-style pathspecs
for p in "${PATHS[@]}"; do
  if [[ "$p" == "." || "$p" == ":/" || "$p" == ":()" ]]; then
    git_ai_die "refusing bulk pathspec '${p}'; list explicit files or directories"
  fi
done

if ! git add -- "${PATHS[@]}"; then
  git_ai_die "git add failed for pathspecs: ${PATHS[*]}"
fi

if [[ -z "$MESSAGE" ]]; then
  git_ai_info "staged only (no commit): ${PATHS[*]}"
  git diff --cached --stat || true
  git_ai_print_status
  exit 0
fi

if git diff --cached --quiet; then
  git_ai_die "nothing to commit (index empty after staging)"
fi

if ! git commit -m "$MESSAGE"; then
  echo "error: git commit failed (hooks may have rejected or modified files; do not amend)" >&2
  git_ai_print_status >&2
  exit 1
fi

git_ai_info "committed (full index)"
git_ai_print_status
exit 0
