#!/usr/bin/env bash
# Read-only passthrough for `git diff` (allowlist-friendly; prefer over raw git).
# Usage: git-diff.sh [git-diff-args...]
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap

exec git --no-pager diff "$@"
