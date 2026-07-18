#!/usr/bin/env bash
# Mechanical end-of-refinement publish for the refine workflow.
# Usage: refine-publish.sh <issue-number>
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

git_ai_bootstrap
git_ai_require_origin
git_ai_require_gh

if [[ $# -ne 1 ]]; then
  cat <<'EOF' >&2
Usage: refine-publish.sh <issue-number>

Publishes .refinement/<N>-draft.md to the GitHub issue body via gh
(--body-file), ensures READY label, unassigns all assignees, deletes the
draft (and .refinement/ if empty), then prints verified issue state.
Does not create or edit draft content.
EOF
  exit 1
fi

ISSUE="$1"
if [[ ! "$ISSUE" =~ ^[0-9]+$ ]] || (( 10#$ISSUE <= 0 )); then
  git_ai_die "issue number must be a positive integer: $ISSUE"
fi

DRAFT_PATH=".refinement/${ISSUE}-draft.md"
if [[ ! -f "$DRAFT_PATH" ]]; then
  git_ai_die "draft not found: $DRAFT_PATH (refine publish requires an agreed draft)"
fi

DRAFT_BYTES="$(wc -c <"$DRAFT_PATH" | tr -d ' ')"
DRAFT_LINES="$(wc -l <"$DRAFT_PATH" | tr -d ' ')"

# Body from file — never pipe draft through agent-invented serializers.
if ! gh issue edit "$ISSUE" --body-file "$DRAFT_PATH" >/dev/null; then
  git_ai_die "gh issue edit --body-file failed for #$ISSUE"
fi

if ! gh issue edit "$ISSUE" --add-label READY >/dev/null; then
  git_ai_die "gh issue edit --add-label READY failed for #$ISSUE"
fi

mapfile -t ASSIGNEES < <(gh issue view "$ISSUE" --json assignees -q '.assignees[].login' 2>/dev/null || true)
REMOVED=()
if [[ ${#ASSIGNEES[@]} -gt 0 ]]; then
  for login in "${ASSIGNEES[@]}"; do
    [[ -n "$login" ]] || continue
    if gh issue edit "$ISSUE" --remove-assignee "$login" >/dev/null; then
      REMOVED+=("$login")
    else
      git_ai_die "gh issue edit --remove-assignee failed for #$ISSUE ($login)"
    fi
  done
fi

rm -f "$DRAFT_PATH"
DRAFT_DELETED="yes"
if [[ -d .refinement ]] && [[ -z "$(ls -A .refinement 2>/dev/null || true)" ]]; then
  rmdir .refinement
  REFINEMENT_REMOVED="yes"
else
  REFINEMENT_REMOVED="no"
fi

# Single verified snapshot — agents should not chain extra gh after this script.
VIEW_JSON="$(gh issue view "$ISSUE" --json url,title,state,labels,assignees,body)"
ISSUE_URL="$(echo "$VIEW_JSON" | jq -r .url)"
ISSUE_TITLE="$(echo "$VIEW_JSON" | jq -r .title)"
ISSUE_STATE="$(echo "$VIEW_JSON" | jq -r .state)"
LABELS="$(echo "$VIEW_JSON" | jq -r '[.labels[].name] | join(",")')"
ASSIGNEES_NOW="$(echo "$VIEW_JSON" | jq -r '[.assignees[].login] | join(",")')"
BODY_BYTES="$(echo "$VIEW_JSON" | jq -r '.body | length')"
BODY_LINES="$(echo "$VIEW_JSON" | jq -r '.body | split("\n") | length')"
HAS_READY="$(echo "$VIEW_JSON" | jq -r 'any(.labels[]; .name == "READY")')"
if [[ "$HAS_READY" == "true" ]]; then
  LABEL_READY="yes"
else
  LABEL_READY="no"
fi

git_ai_info "repo_root=${REPO_ROOT}"
git_ai_info "issue_number=${ISSUE}"
git_ai_info "issue_url=${ISSUE_URL}"
git_ai_info "title=${ISSUE_TITLE}"
git_ai_info "state=${ISSUE_STATE}"
git_ai_info "labels=${LABELS}"
git_ai_info "assignees=${ASSIGNEES_NOW}"
git_ai_info "draft_path=${DRAFT_PATH}"
git_ai_info "draft_bytes=${DRAFT_BYTES}"
git_ai_info "draft_lines=${DRAFT_LINES}"
git_ai_info "body_bytes=${BODY_BYTES}"
git_ai_info "body_lines=${BODY_LINES}"
git_ai_info "draft_deleted=${DRAFT_DELETED}"
git_ai_info "refinement_dir_removed=${REFINEMENT_REMOVED}"
if [[ ${#REMOVED[@]} -gt 0 ]]; then
  git_ai_info "unassigned=$(IFS=,; echo "${REMOVED[*]}")"
else
  git_ai_info "unassigned="
fi
git_ai_info "label_ready=${LABEL_READY}"
exit 0
