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

# --- git-status ---
test_git_status_clean_default() {
  local out
  out="$("$SCRIPTS/git-status.sh" 2>&1)" || {
    echo "  FAIL: git-status run (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("git-status run")
    return 0
  }
  assert_eq "repo_root line" "repo_root=$(cd "$REPO" && pwd)" "$(echo "$out" | grep '^repo_root=')"
  assert_eq "origin_url raw" "origin_url=$BARE" "$(echo "$out" | grep '^origin_url=')"
  assert_eq "default_branch" "default_branch=main" "$(echo "$out" | grep '^default_branch=')"
  assert_eq "current_branch main" "current_branch=main" "$(echo "$out" | grep '^current_branch=')"
  assert_eq "head_detached no" "head_detached=no" "$(echo "$out" | grep '^head_detached=')"
  assert_eq "on_default yes" "on_default=yes" "$(echo "$out" | grep '^on_default=')"
  assert_eq "tracked_dirty no" "tracked_dirty=no" "$(echo "$out" | grep '^tracked_dirty=')"
  assert_eq "has_untracked no" "has_untracked=no" "$(echo "$out" | grep '^has_untracked=')"
  assert_eq "no issue keys without N" "" "$(echo "$out" | grep '^issue_number=' || true)"
  # No status_path lines when clean
  assert_eq "no porcelain paths" "" "$(echo "$out" | grep '^status_path=' || true)"
}

test_git_status_dirty_and_issue_branches() {
  assert_ok "create feature" "$SCRIPTS/checkout-branch.sh" feature/28-schema-ir
  echo feat >"$REPO/feat.txt"
  assert_ok "commit feature" "$SCRIPTS/stage-commit.sh" -m "feat" -- feat.txt
  assert_ok "push feature" "$SCRIPTS/push.sh"

  # Second local-only match should appear in issue_branch_local
  git -C "$REPO" branch feature/28-other >/dev/null

  echo dirty >"$REPO/README"
  echo untracked >"$REPO/u.txt"

  local out
  out="$("$SCRIPTS/git-status.sh" 28 2>&1)" || {
    echo "  FAIL: git-status with N (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("git-status with N")
    return 0
  }
  assert_eq "on_default no" "on_default=no" "$(echo "$out" | grep '^on_default=')"
  assert_eq "tracked_dirty yes" "tracked_dirty=yes" "$(echo "$out" | grep '^tracked_dirty=')"
  assert_eq "has_untracked yes" "has_untracked=yes" "$(echo "$out" | grep '^has_untracked=')"
  assert_eq "upstream set" "upstream=origin/feature/28-schema-ir" "$(echo "$out" | grep '^upstream=')"
  assert_eq "issue_number" "issue_number=28" "$(echo "$out" | grep '^issue_number=')"
  assert_eq "on_issue_branch yes" "on_issue_branch=yes" "$(echo "$out" | grep '^on_issue_branch=')"
  assert_eq "local matches" "issue_branch_local=feature/28-other,feature/28-schema-ir" "$(echo "$out" | grep '^issue_branch_local=')"
  assert_eq "remote matches" "issue_branch_remote=origin/feature/28-schema-ir" "$(echo "$out" | grep '^issue_branch_remote=')"
  echo "$out" | grep -qE '^status_path=.M README'
  assert_eq "porcelain modified README" "0" "$?"
  echo "$out" | grep -q '^status_path=?? u.txt'
  assert_eq "porcelain untracked u.txt" "0" "$?"

  # Discard dirty state so we can switch branches cleanly
  git -C "$REPO" checkout -- README
  rm -f "$REPO/u.txt"

  # On main: matching branches exist but on_issue_branch=no
  git -C "$REPO" checkout main >/dev/null
  out="$("$SCRIPTS/git-status.sh" 28 2>&1)"
  assert_eq "on_issue_branch no on main" "on_issue_branch=no" "$(echo "$out" | grep '^on_issue_branch=')"
  # Unrelated issue number → empty matches
  out="$("$SCRIPTS/git-status.sh" 99 2>&1)"
  assert_eq "empty local for 99" "issue_branch_local=" "$(echo "$out" | grep '^issue_branch_local=')"
  assert_eq "empty remote for 99" "issue_branch_remote=" "$(echo "$out" | grep '^issue_branch_remote=')"
}

test_git_status_detached() {
  local sha
  sha="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" checkout --detach "$sha" >/dev/null 2>&1
  local out
  out="$("$SCRIPTS/git-status.sh" 2>&1)" || {
    echo "  FAIL: git-status detached should succeed (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("git-status detached")
    return 0
  }
  assert_eq "head_detached yes" "head_detached=yes" "$(echo "$out" | grep '^head_detached=')"
  assert_eq "on_default no when detached" "on_default=no" "$(echo "$out" | grep '^on_default=')"
  assert_eq "empty upstream when detached" "upstream=" "$(echo "$out" | grep '^upstream=')"
}

test_git_status_bad_args() {
  assert_fail "non-integer N" "$SCRIPTS/git-status.sh" abc
  assert_fail "zero N" "$SCRIPTS/git-status.sh" 0
  assert_fail "negative N" "$SCRIPTS/git-status.sh" -7
  assert_fail "extra args" "$SCRIPTS/git-status.sh" 28 29
}

test_git_status_missing_origin() {
  git -C "$REPO" remote remove origin
  assert_fail "missing origin" "$SCRIPTS/git-status.sh"
}

# --- branch-diff ---
test_branch_diff_on_default_empty() {
  local out
  out="$("$SCRIPTS/branch-diff.sh" 2>&1)" || {
    echo "  FAIL: branch-diff on default (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("branch-diff on default")
    return 0
  }
  assert_eq "base_ref" "base_ref=origin/main" "$(echo "$out" | grep '^base_ref=')"
  assert_eq "compare_ref HEAD" "compare_ref=HEAD" "$(echo "$out" | grep '^compare_ref=')"
  assert_eq "commits_ahead 0" "commits_ahead=0" "$(echo "$out" | grep '^commits_ahead=')"
  assert_eq "no commit lines" "" "$(echo "$out" | grep '^commit=' || true)"
  assert_eq "no diff_stat" "" "$(echo "$out" | grep '^diff_stat=' || true)"
  assert_eq "no diff_summary" "" "$(echo "$out" | grep '^diff_summary=' || true)"
}

test_branch_diff_feature_commits_and_stat() {
  assert_ok "create feature" "$SCRIPTS/checkout-branch.sh" feature/diff-me
  echo a >"$REPO/a.txt"
  echo b >"$REPO/b.txt"
  assert_ok "commit" "$SCRIPTS/stage-commit.sh" -m "add a and b" -- a.txt b.txt

  local out
  out="$("$SCRIPTS/branch-diff.sh" 2>&1)" || {
    echo "  FAIL: branch-diff on feature (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("branch-diff on feature")
    return 0
  }
  assert_eq "commits_ahead 1" "commits_ahead=1" "$(echo "$out" | grep '^commits_ahead=')"
  echo "$out" | grep -qE '^commit=[0-9a-f]+ add a and b$'
  assert_eq "commit oneline" "0" "$?"
  echo "$out" | grep -q '^diff_stat= a.txt'
  assert_eq "diff_stat a.txt" "0" "$?"
  echo "$out" | grep -q '^diff_stat= b.txt'
  assert_eq "diff_stat b.txt" "0" "$?"
  echo "$out" | grep -qE '^diff_summary= 2 files changed'
  assert_eq "diff_summary" "0" "$?"

  # Explicit ref works while on another branch
  git -C "$REPO" checkout main >/dev/null
  out="$("$SCRIPTS/branch-diff.sh" feature/diff-me 2>&1)"
  assert_eq "compare_ref named" "compare_ref=feature/diff-me" "$(echo "$out" | grep '^compare_ref=')"
  assert_eq "commits_ahead via named" "commits_ahead=1" "$(echo "$out" | grep '^commits_ahead=')"
}

test_branch_diff_bad_args() {
  assert_fail "extra args" "$SCRIPTS/branch-diff.sh" HEAD main
  assert_fail "dash ref" "$SCRIPTS/branch-diff.sh" --oops
  assert_fail "missing ref" "$SCRIPTS/branch-diff.sh" does-not-exist
}

test_branch_diff_missing_origin() {
  git -C "$REPO" remote remove origin
  assert_fail "missing origin" "$SCRIPTS/branch-diff.sh"
}

# --- refine-publish ---
test_refine_publish_happy_path() {
  mkdir -p "$REPO/.refinement"
  echo "# agreed draft" >"$REPO/.refinement/7-draft.md"

  local stub="$TEST_TMP/bin"
  mkdir -p "$stub"
  cat >"$stub/gh" <<'EOF'
#!/usr/bin/env bash
logfile="${GIT_AI_GH_LOG:?}"
echo "$*" >>"$logfile"
if [[ "$1" == "auth" && "$2" == "status" ]]; then
  exit 0
fi
if [[ "$1" == "issue" && "$2" == "edit" ]]; then
  exit 0
fi
if [[ "$1" == "issue" && "$2" == "view" ]]; then
  # Pre-unassign assignee listing (no --json url/title bundle)
  if [[ "$*" == *assignees* && "$*" != *title* ]]; then
    echo "alice"
    echo "bob"
    exit 0
  fi
  # Final verified snapshot
  if [[ "$*" == *--json* ]]; then
    cat <<'JSON'
{"url":"https://github.com/example/untangled/issues/7","title":"Schema migrations baseline","state":"OPEN","labels":[{"name":"M1"},{"name":"READY"}],"assignees":[],"body":"# agreed draft\n"}
JSON
    exit 0
  fi
fi
echo "unexpected gh args: $*" >&2
exit 1
EOF
  chmod +x "$stub/gh"

  local log="$TEST_TMP/gh.log"
  : >"$log"
  local out
  out="$(
    PATH="$stub:$PATH" GIT_AI_GH_LOG="$log" \
      "$SCRIPTS/refine-publish.sh" 7 2>&1
  )" || {
    echo "  FAIL: publish run (rc=$?)"
    echo "$out" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAILURES+=("publish run")
    return 0
  }

  [[ ! -f "$REPO/.refinement/7-draft.md" ]]
  assert_eq "draft deleted" "0" "$?"
  assert_eq "issue_url line" "issue_url=https://github.com/example/untangled/issues/7" "$(echo "$out" | grep '^issue_url=')"
  assert_eq "title line" "title=Schema migrations baseline" "$(echo "$out" | grep '^title=')"
  assert_eq "state line" "state=OPEN" "$(echo "$out" | grep '^state=')"
  assert_eq "labels line" "labels=M1,READY" "$(echo "$out" | grep '^labels=')"
  assert_eq "assignees empty" "assignees=" "$(echo "$out" | grep '^assignees=')"
  assert_eq "draft_deleted yes" "draft_deleted=yes" "$(echo "$out" | grep '^draft_deleted=')"
  assert_eq "label_ready yes" "label_ready=yes" "$(echo "$out" | grep '^label_ready=')"
  assert_eq "unassigned both" "unassigned=alice,bob" "$(echo "$out" | grep '^unassigned=')"
  grep -q -- '--body-file .refinement/7-draft.md' "$log"
  assert_eq "used body-file" "0" "$?"
  grep -q -- '--add-label READY' "$log"
  assert_eq "added READY" "0" "$?"
}

test_refine_publish_bad_args_and_missing_draft() {
  assert_fail "missing N" "$SCRIPTS/refine-publish.sh"
  assert_fail "non-integer N" "$SCRIPTS/refine-publish.sh" abc
  assert_fail "zero N" "$SCRIPTS/refine-publish.sh" 0
  assert_fail "missing draft" "$SCRIPTS/refine-publish.sh" 99
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
  with_fixture "git-status clean default" test_git_status_clean_default
  with_fixture "git-status dirty+issue" test_git_status_dirty_and_issue_branches
  with_fixture "git-status detached" test_git_status_detached
  with_fixture "git-status bad args" test_git_status_bad_args
  with_fixture "git-status no origin" test_git_status_missing_origin
  with_fixture "branch-diff empty default" test_branch_diff_on_default_empty
  with_fixture "branch-diff feature" test_branch_diff_feature_commits_and_stat
  with_fixture "branch-diff bad args" test_branch_diff_bad_args
  with_fixture "branch-diff no origin" test_branch_diff_missing_origin
  with_fixture "refine publish" test_refine_publish_happy_path
  with_fixture "refine publish bad args" test_refine_publish_bad_args_and_missing_draft

  echo
  echo "Results: $PASS passed, $FAIL failed"
  if [[ $FAIL -gt 0 ]]; then
    printf 'Failed: %s\n' "${FAILURES[@]}"
    exit 1
  fi
  exit 0
}

main
