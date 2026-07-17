#!/usr/bin/env bash
# Skill-local tests for git-ai scripts. Uses temp fixtures only — never the real repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="$ROOT/scripts"
PASS=0
FAIL=0
FAILURES=()

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected='$expected' actual='$actual')"
    FAIL=$((FAIL + 1))
    FAILURES+=("$label")
  fi
}

assert_ok() {
  local label="$1"
  shift
  local out rc=0
  out="$("$@" 2>&1)" || rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (rc=$rc)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("$label")
  fi
}

assert_fail() {
  local label="$1"
  shift
  local out rc=0
  out="$("$@" 2>&1)" || rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected non-zero, got 0)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("$label")
  fi
}

# Create a bare remote + clone with an initial commit on main.
# Sets: TEST_TMP, BARE, REPO, and exports GIT_AI_REPO_ROOT=$REPO
setup_fixture() {
  TEST_TMP="$(mktemp -d "${TMPDIR:-/tmp}/git-ai-test.XXXXXX")"
  BARE="$TEST_TMP/remote.git"
  REPO="$TEST_TMP/work"
  git init --bare -b main "$BARE" >/dev/null
  git clone "$BARE" "$REPO" >/dev/null 2>&1
  git -C "$REPO" config user.email "test@example.com"
  git -C "$REPO" config user.name "git-ai test"
  echo "seed" >"$REPO/README"
  git -C "$REPO" add README
  git -C "$REPO" commit -m "seed" >/dev/null
  git -C "$REPO" push -u origin main >/dev/null
  # Ensure origin/HEAD -> main
  git -C "$REPO" remote set-head origin -a >/dev/null 2>&1 || true
  export GIT_AI_REPO_ROOT="$REPO"
}

cleanup_fixture() {
  unset GIT_AI_REPO_ROOT || true
  if [[ -n "${TEST_TMP:-}" && -d "$TEST_TMP" ]]; then
    rm -rf "$TEST_TMP"
  fi
}

with_fixture() {
  local name="$1"
  shift
  echo "== $name =="
  setup_fixture
  # shellcheck disable=SC2064
  trap cleanup_fixture RETURN
  "$@"
  cleanup_fixture
  trap - RETURN
}

# --- common.sh bootstrap ---
test_common_repo_root_override() {
  local out
  out="$(
    cd /tmp
    GIT_AI_REPO_ROOT="$REPO" bash -c "
      source '$SCRIPTS/common.sh'
      git_ai_bootstrap
      pwd
    "
  )"
  assert_eq "GIT_AI_REPO_ROOT used" "$(cd "$REPO" && pwd)" "$out"
}

test_common_self_locate() {
  # Copy bootstrap into the fixture and invoke via a thin wrapper so
  # BASH_SOURCE resolves the fixture repo (not the real Untangled tree).
  mkdir -p "$REPO/.git-ai-scripts"
  cp "$SCRIPTS/common.sh" "$REPO/.git-ai-scripts/"
  cat >"$REPO/.git-ai-scripts/probe.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
git_ai_bootstrap
pwd
EOF
  chmod +x "$REPO/.git-ai-scripts/probe.sh"
  local out
  out="$(
    unset GIT_AI_REPO_ROOT
    cd /tmp
    "$REPO/.git-ai-scripts/probe.sh"
  )" || true
  assert_eq "self-locate from script path" "$(cd "$REPO" && pwd)" "$out"
}

# --- checkout-branch ---
test_checkout_existing_local() {
  git -C "$REPO" checkout -b feature/existing >/dev/null
  git -C "$REPO" checkout main >/dev/null
  assert_ok "checkout existing local" "$SCRIPTS/checkout-branch.sh" feature/existing
  assert_eq "on feature/existing" "feature/existing" "$(git -C "$REPO" branch --show-current)"
}

test_checkout_remote_only() {
  git -C "$REPO" checkout -b feature/remote-only >/dev/null
  echo x >"$REPO/x"
  git -C "$REPO" add x && git -C "$REPO" commit -m "x" >/dev/null
  git -C "$REPO" push -u origin feature/remote-only >/dev/null
  git -C "$REPO" checkout main >/dev/null
  git -C "$REPO" branch -D feature/remote-only >/dev/null
  assert_ok "checkout remote-only" "$SCRIPTS/checkout-branch.sh" feature/remote-only
  assert_eq "tracking branch" "feature/remote-only" "$(git -C "$REPO" branch --show-current)"
}

test_checkout_brand_new_from_default() {
  assert_ok "brand-new from default" "$SCRIPTS/checkout-branch.sh" feature/brand-new
  assert_eq "on brand-new" "feature/brand-new" "$(git -C "$REPO" branch --show-current)"
}

test_checkout_brand_new_abort_off_topic() {
  git -C "$REPO" checkout -b feature/other >/dev/null
  assert_fail "brand-new off topic aborts" "$SCRIPTS/checkout-branch.sh" feature/should-fail
}

test_checkout_brand_new_abort_stale_default() {
  # Make local main behind by advancing remote and resetting local? Easier:
  # create diverging commit only locally on main without push, then try create.
  echo stale >"$REPO/stale"
  git -C "$REPO" add stale && git -C "$REPO" commit -m "stale local" >/dev/null
  # Now main is ahead of origin — not FF-equal
  assert_fail "brand-new on stale/ahead default aborts" "$SCRIPTS/checkout-branch.sh" feature/nope
}

# --- stage-commit ---
test_stage_commit_paths() {
  echo a >"$REPO/a.txt"
  echo b >"$REPO/b.txt"
  assert_ok "stage only" "$SCRIPTS/stage-commit.sh" -- a.txt
  # a staged, b untracked
  git -C "$REPO" diff --cached --name-only | grep -qx a.txt
  assert_eq "a staged" "0" "$?"
  assert_ok "accumulate b" "$SCRIPTS/stage-commit.sh" -- b.txt
  local staged
  staged="$(git -C "$REPO" diff --cached --name-only | sort | tr '\n' ' ')"
  assert_eq "both staged" "a.txt b.txt " "$staged"
  assert_ok "commit full index" "$SCRIPTS/stage-commit.sh" -m "add a and b" -- a.txt
  assert_eq "clean after commit" "" "$(git -C "$REPO" status --porcelain)"
}

test_stage_refuse_bulk() {
  echo z >"$REPO/z.txt"
  assert_fail "refuse --all" "$SCRIPTS/stage-commit.sh" --all -- z.txt
  assert_fail "refuse path ." "$SCRIPTS/stage-commit.sh" -- .
}

test_stage_no_amend() {
  echo c >"$REPO/c.txt"
  assert_ok "first commit" "$SCRIPTS/stage-commit.sh" -m "c1" -- c.txt
  echo d >"$REPO/d.txt"
  assert_ok "second commit" "$SCRIPTS/stage-commit.sh" -m "c2" -- d.txt
  local count
  count="$(git -C "$REPO" rev-list --count HEAD)"
  assert_eq "two commits not amend" "3" "$count"  # seed + c1 + c2
}

# --- push ---
test_push_first_and_ff() {
  assert_ok "create branch" "$SCRIPTS/checkout-branch.sh" feature/push-me
  echo p >"$REPO/p.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "p" -- p.txt
  assert_ok "first push -u" "$SCRIPTS/push.sh"
  assert_eq "has upstream" "origin/feature/push-me" "$(git -C "$REPO" rev-parse --abbrev-ref '@{u}')"

  # Simulate being behind: push another commit from a second clone
  local other="$TEST_TMP/other"
  git clone "$BARE" "$other" >/dev/null 2>&1
  git -C "$other" config user.email "test@example.com"
  git -C "$other" config user.name "git-ai test"
  git -C "$other" checkout feature/push-me >/dev/null 2>&1
  echo q >"$other/q.txt"
  git -C "$other" add q.txt && git -C "$other" commit -m "q" >/dev/null
  git -C "$other" push >/dev/null

  # Local is behind; push.sh should FF-only pull then push (no local commits to push)
  assert_ok "ff-only integrate when behind" "$SCRIPTS/push.sh"
  test -f "$REPO/q.txt"
  assert_eq "got remote file" "0" "$?"
}

test_push_refuse_default() {
  git -C "$REPO" checkout main >/dev/null
  assert_fail "refuse push default" "$SCRIPTS/push.sh"
}

test_push_abort_divergence() {
  assert_ok "create branch" "$SCRIPTS/checkout-branch.sh" feature/diverge
  echo l >"$REPO/l.txt"
  assert_ok "local commit" "$SCRIPTS/stage-commit.sh" -m "local" -- l.txt
  assert_ok "push" "$SCRIPTS/push.sh"

  local other="$TEST_TMP/other2"
  git clone "$BARE" "$other" >/dev/null 2>&1
  git -C "$other" config user.email "test@example.com"
  git -C "$other" config user.name "git-ai test"
  git -C "$other" checkout feature/diverge >/dev/null 2>&1
  echo r >"$other/r.txt"
  git -C "$other" add r.txt && git -C "$other" commit -m "remote" >/dev/null
  git -C "$other" push >/dev/null

  echo ll >>"$REPO/l.txt"
  git -C "$REPO" add l.txt && git -C "$REPO" commit -m "local2" >/dev/null
  assert_fail "abort on divergence" "$SCRIPTS/push.sh"
}

test_push_https_hint_on_failure() {
  assert_ok "create branch" "$SCRIPTS/checkout-branch.sh" feature/https-hint
  echo h >"$REPO/h.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "h" -- h.txt

  git -C "$REPO" remote set-url origin "https://example.invalid/untangled.git"

  local real_git stub out rc=0
  real_git="$(command -v git)"
  stub="$TEST_TMP/bin"
  mkdir -p "$stub"
  cat >"$stub/git" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "push" ]]; then
  echo "fatal: could not read Username for 'https://example.invalid': No such device or address" >&2
  exit 1
fi
if [[ "\$1" == "fetch" ]]; then
  exit 0
fi
exec "$real_git" "\$@"
EOF
  chmod +x "$stub/git"

  out="$(PATH="$stub:$PATH" "$SCRIPTS/push.sh" 2>&1)" || rc=$?
  if [[ $rc -ne 0 ]] && echo "$out" | grep -q "HTTP(S) URL" && echo "$out" | grep -q "SSH/git protocol"; then
    echo "  PASS: https hint on push failure"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: https hint on push failure (rc=$rc)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("https hint on push failure")
  fi
}

# --- sync-default ---
test_sync_ff_and_dirty_abort() {
  # Advance remote main
  local other="$TEST_TMP/adv"
  git clone "$BARE" "$other" >/dev/null 2>&1
  git -C "$other" config user.email "test@example.com"
  git -C "$other" config user.name "git-ai test"
  echo adv >"$other/adv.txt"
  git -C "$other" add adv.txt && git -C "$other" commit -m "adv" >/dev/null
  git -C "$other" push >/dev/null

  git -C "$REPO" checkout -b feature/tmp >/dev/null
  assert_ok "sync from topic" "$SCRIPTS/sync-default.sh"
  assert_eq "on main" "main" "$(git -C "$REPO" branch --show-current)"
  test -f "$REPO/adv.txt"
  assert_eq "ff pulled adv" "0" "$?"

  echo dirty >"$REPO/README"
  git -C "$REPO" checkout -b feature/dirty >/dev/null 2>&1 || true
  # tracked dirty on topic; sync should abort when leaving
  if git -C "$REPO" rev-parse --verify feature/dirty >/dev/null 2>&1; then
    :
  else
    git -C "$REPO" checkout -b feature/dirty >/dev/null
  fi
  # ensure we're on feature with dirty README
  git -C "$REPO" checkout feature/dirty >/dev/null 2>&1 || git -C "$REPO" checkout -B feature/dirty >/dev/null
  echo dirty2 >"$REPO/README"
  assert_fail "dirty blocks sync checkout" "$SCRIPTS/sync-default.sh"
}

test_sync_delete_merged_ancestry() {
  assert_ok "branch" "$SCRIPTS/checkout-branch.sh" feature/merged
  echo m >"$REPO/m.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "m" -- m.txt
  assert_ok "push" "$SCRIPTS/push.sh"
  # Merge into main via FF on remote side: checkout main, merge, push
  git -C "$REPO" checkout main >/dev/null
  git -C "$REPO" merge --ff-only feature/merged >/dev/null
  git -C "$REPO" push origin main >/dev/null
  assert_ok "sync delete ancestry" "$SCRIPTS/sync-default.sh" --delete-branch feature/merged
  if git -C "$REPO" show-ref --verify --quiet refs/heads/feature/merged; then
    assert_eq "branch deleted" "gone" "still-exists"
  else
    assert_eq "branch deleted" "gone" "gone"
  fi
}

test_sync_delete_tree_equivalent_squash() {
  assert_ok "branch" "$SCRIPTS/checkout-branch.sh" feature/squash
  echo s >"$REPO/s.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "s" -- s.txt
  assert_ok "push" "$SCRIPTS/push.sh"
  # Simulate squash: on main, apply same tree as a new commit, push; leave feature tip not ancestor
  git -C "$REPO" checkout main >/dev/null
  echo s >"$REPO/s.txt"
  git -C "$REPO" add s.txt && git -C "$REPO" commit -m "squash of s" >/dev/null
  git -C "$REPO" push origin main >/dev/null
  # feature/squash is not ancestor but trees match
  assert_ok "delete via tree-eq" "$SCRIPTS/sync-default.sh" --delete-branch feature/squash
  if git -C "$REPO" show-ref --verify --quiet refs/heads/feature/squash; then
    assert_eq "squash branch deleted" "gone" "still-exists"
  else
    assert_eq "squash branch deleted" "gone" "gone"
  fi
}

test_sync_delete_via_gh_stub() {
  assert_ok "branch" "$SCRIPTS/checkout-branch.sh" feature/gh-merge
  echo g >"$REPO/g.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "g" -- g.txt
  assert_ok "push" "$SCRIPTS/push.sh"
  # Make trees differ and no ancestry: change main differently
  git -C "$REPO" checkout main >/dev/null
  echo other >"$REPO/other.txt"
  git -C "$REPO" add other.txt && git -C "$REPO" commit -m "other" >/dev/null
  git -C "$REPO" push origin main >/dev/null

  # Stub gh on PATH
  local stub="$TEST_TMP/bin"
  mkdir -p "$stub"
  cat >"$stub/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "auth" && "$2" == "status" ]]; then
  exit 0
fi
if [[ "$1" == "pr" && "$2" == "list" ]]; then
  echo "1"
  exit 0
fi
echo "unexpected gh args: $*" >&2
exit 1
EOF
  chmod +x "$stub/gh"
  PATH="$stub:$PATH" assert_ok "delete via gh merged PR" "$SCRIPTS/sync-default.sh" --delete-branch feature/gh-merge
}

test_sync_abort_unpushed() {
  assert_ok "branch" "$SCRIPTS/checkout-branch.sh" feature/unpushed
  echo u >"$REPO/u.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "u" -- u.txt
  assert_ok "push" "$SCRIPTS/push.sh"
  echo u2 >>"$REPO/u.txt"
  git -C "$REPO" add u.txt && git -C "$REPO" commit -m "unpushed" >/dev/null
  # Merge ancestry path on remote without the unpushed commit — but hard gate is
  # local ahead of origin/feature → must abort regardless.
  git -C "$REPO" checkout main >/dev/null
  assert_fail "abort delete with unpushed" "$SCRIPTS/sync-default.sh" --delete-branch feature/unpushed
}

test_gh_missing_auth_failure() {
  assert_ok "branch" "$SCRIPTS/checkout-branch.sh" feature/no-gh
  echo n >"$REPO/n.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "n" -- n.txt
  assert_ok "push" "$SCRIPTS/push.sh"
  git -C "$REPO" checkout main >/dev/null
  echo o >"$REPO/o.txt"
  git -C "$REPO" add o.txt && git -C "$REPO" commit -m "o" >/dev/null
  git -C "$REPO" push origin main >/dev/null
  # Trees differ, not ancestor → needs gh; stub auth failure
  local stub="$TEST_TMP/bin"
  mkdir -p "$stub"
  cat >"$stub/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "auth" ]]; then
  exit 1
fi
exit 1
EOF
  chmod +x "$stub/gh"
  PATH="$stub:$PATH" assert_fail "gh auth failure blocks delete" "$SCRIPTS/sync-default.sh" --delete-branch feature/no-gh
}

# --- refine-preflight ---
test_refine_preflight_creates_and_reports() {
  local out
  # .refinement absent → created, draft_exists=no
  [[ ! -d "$REPO/.refinement" ]]
  assert_eq "no .refinement before run" "0" "$?"
  out="$("$SCRIPTS/refine-preflight.sh" 42 2>&1)" || {
    echo "  FAIL: preflight run (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("preflight run")
    return 0
  }
  [[ -d "$REPO/.refinement" ]]
  assert_eq ".refinement created" "0" "$?"
  assert_eq "repo_root line" "repo_root=$(cd "$REPO" && pwd)" "$(echo "$out" | grep '^repo_root=')"
  assert_eq "origin_url raw" "origin_url=$BARE" "$(echo "$out" | grep '^origin_url=')"
  assert_eq "issue_number line" "issue_number=42" "$(echo "$out" | grep '^issue_number=')"
  assert_eq "draft_path line" "draft_path=.refinement/42-draft.md" "$(echo "$out" | grep '^draft_path=')"
  assert_eq "draft_exists no" "draft_exists=no" "$(echo "$out" | grep '^draft_exists=')"

  # Idempotent when .refinement already exists
  assert_ok "idempotent rerun" "$SCRIPTS/refine-preflight.sh" 42

  # Existing draft reported and left untouched
  echo "draft body" >"$REPO/.refinement/42-draft.md"
  out="$("$SCRIPTS/refine-preflight.sh" 42 2>&1)"
  assert_eq "draft_exists yes" "draft_exists=yes" "$(echo "$out" | grep '^draft_exists=')"
  assert_eq "draft untouched" "draft body" "$(cat "$REPO/.refinement/42-draft.md")"
}

test_refine_preflight_bad_args() {
  assert_fail "missing N" "$SCRIPTS/refine-preflight.sh"
  assert_fail "non-integer N" "$SCRIPTS/refine-preflight.sh" abc
  assert_fail "zero N" "$SCRIPTS/refine-preflight.sh" 0
  assert_fail "negative N" "$SCRIPTS/refine-preflight.sh" -7
  assert_fail "extra args" "$SCRIPTS/refine-preflight.sh" 42 43
}

test_refine_preflight_missing_origin() {
  git -C "$REPO" remote remove origin
  assert_fail "missing origin" "$SCRIPTS/refine-preflight.sh" 42
}

# --- run all ---
main() {
  with_fixture "common override" test_common_repo_root_override
  with_fixture "common self-locate" test_common_self_locate
  with_fixture "checkout local" test_checkout_existing_local
  with_fixture "checkout remote-only" test_checkout_remote_only
  with_fixture "checkout brand-new" test_checkout_brand_new_from_default
  with_fixture "checkout abort off-topic" test_checkout_brand_new_abort_off_topic
  with_fixture "checkout abort stale" test_checkout_brand_new_abort_stale_default
  with_fixture "stage-commit" test_stage_commit_paths
  with_fixture "stage refuse bulk" test_stage_refuse_bulk
  with_fixture "stage no amend" test_stage_no_amend
  with_fixture "push first+ff" test_push_first_and_ff
  with_fixture "push refuse default" test_push_refuse_default
  with_fixture "push diverge" test_push_abort_divergence
  with_fixture "push https hint" test_push_https_hint_on_failure
  with_fixture "sync ff+dirty" test_sync_ff_and_dirty_abort
  with_fixture "sync delete ancestry" test_sync_delete_merged_ancestry
  with_fixture "sync delete tree-eq" test_sync_delete_tree_equivalent_squash
  with_fixture "sync delete gh" test_sync_delete_via_gh_stub
  with_fixture "sync abort unpushed" test_sync_abort_unpushed
  with_fixture "gh auth fail" test_gh_missing_auth_failure
  with_fixture "refine preflight" test_refine_preflight_creates_and_reports
  with_fixture "refine preflight bad args" test_refine_preflight_bad_args
  with_fixture "refine preflight no origin" test_refine_preflight_missing_origin

  echo
  echo "Results: $PASS passed, $FAIL failed"
  if [[ $FAIL -gt 0 ]]; then
    printf 'Failed: %s\n' "${FAILURES[@]}"
    exit 1
  fi
  exit 0
}

main
