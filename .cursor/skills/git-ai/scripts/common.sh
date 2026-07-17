#!/usr/bin/env bash
# Shared bootstrap and helpers for git-ai scripts.
# shellcheck shell=bash

set -euo pipefail

git_ai_die() {
  echo "error: $*" >&2
  exit 1
}

git_ai_info() {
  echo "$*"
}

# Resolve REPO_ROOT and cd there.
# Prefer GIT_AI_REPO_ROOT (tests / diagnostics only); otherwise locate from the
# calling script's path (BASH_SOURCE[1] when sourced).
git_ai_bootstrap() {
  local caller="${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}"
  local script_dir
  script_dir="$(cd "$(dirname "$caller")" && pwd)"

  if [[ -n "${GIT_AI_REPO_ROOT:-}" ]]; then
    if [[ ! -d "$GIT_AI_REPO_ROOT" ]]; then
      git_ai_die "GIT_AI_REPO_ROOT is not a directory: $GIT_AI_REPO_ROOT"
    fi
    if ! git -C "$GIT_AI_REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git_ai_die "GIT_AI_REPO_ROOT is not a git work tree: $GIT_AI_REPO_ROOT"
    fi
    REPO_ROOT="$(git -C "$GIT_AI_REPO_ROOT" rev-parse --show-toplevel)"
  else
    if ! REPO_ROOT="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null)"; then
      git_ai_die "not inside a git work tree (resolved from $script_dir)"
    fi
  fi

  cd "$REPO_ROOT"
  export REPO_ROOT
}

git_ai_require_origin() {
  if ! git remote get-url origin >/dev/null 2>&1; then
    git_ai_die "remote 'origin' does not exist"
  fi
}

# Print default branch short name (e.g. main), resolved from origin/HEAD.
git_ai_default_branch() {
  local ref
  if ! ref="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null)"; then
    # Try to set origin/HEAD from remote; still fail closed if unresolved.
    git remote set-head origin -a >/dev/null 2>&1 || true
    if ! ref="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null)"; then
      git_ai_die "could not resolve default branch from refs/remotes/origin/HEAD"
    fi
  fi
  echo "${ref#refs/remotes/origin/}"
}

git_ai_current_branch() {
  local branch
  if ! branch="$(git symbolic-ref -q --short HEAD 2>/dev/null)"; then
    git_ai_die "detached HEAD is not allowed"
  fi
  echo "$branch"
}

# True if there are staged or unstaged changes to tracked files.
git_ai_tracked_dirty() {
  ! git diff --quiet || ! git diff --cached --quiet
}

git_ai_print_status() {
  git status
}

git_ai_print_status_short() {
  git status -sb
}

# Left/right divergence summary between two refs.
git_ai_print_divergence() {
  local left="$1"
  local right="$2"
  local ahead behind
  ahead="$(git rev-list --count "${right}..${left}" 2>/dev/null || echo "?")"
  behind="$(git rev-list --count "${left}..${right}" 2>/dev/null || echo "?")"
  echo "divergence: ${left} is ahead=${ahead} behind=${behind} relative to ${right}"
  echo "commits on ${left} not in ${right}:"
  git log --oneline "${right}..${left}" 2>/dev/null || true
  echo "commits on ${right} not in ${left}:"
  git log --oneline "${left}..${right}" 2>/dev/null || true
}

git_ai_require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    git_ai_die "gh is required for this check but is not on PATH; install GitHub CLI or use ancestry/tree-equivalent delete predicates"
  fi
  if ! gh auth status >/dev/null 2>&1; then
    git_ai_die "gh is not authenticated; fix with 'gh auth login' (or equivalent) in your environment — scripts will not run gh auth"
  fi
}

# Return 0 if gh reports a merged PR from head_branch into base_branch.
git_ai_gh_merged_pr() {
  local head_branch="$1"
  local base_branch="$2"
  local count
  git_ai_require_gh
  count="$(gh pr list --head "$head_branch" --base "$base_branch" --state merged --limit 1 --json number --jq 'length')"
  [[ "$count" -gt 0 ]]
}
