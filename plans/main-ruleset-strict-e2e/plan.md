# Plan: Require up-to-date branches and app-e2e in the main ruleset (issue #64)

**Status:** active

Risk tier: Low. The repository change is one workflow comment. The ruleset change is a settings edit, already applied with `gh api` and read back, and it is reversible from the saved copy.

Domain skills: none apply. The change touches no app code, backend, UI or email.

## Goal

Decision Q5 in `plans/frontend-v1/plan.md`: the "Protect main" ruleset requires branches to be up to date before merging, and requires `app-e2e` next to `sign-off`, `app-checks` and `teaser-build`. Several PRs merge in parallel, and this stops two green PRs from breaking `main` together.

## Acceptance criteria

1. Ruleset 26885653 ("Protect main") has `strict_required_status_checks_policy: true` and requires `app-e2e` from GitHub Actions (integration 15368). Its other rules, conditions, enforcement and bypass actors are unchanged.
2. The comment above `jobs:` in `.github/workflows/ci-app.yml` says that `app-checks` and `app-e2e` are both required status checks on `main`, so renaming either job must also update the ruleset. It no longer says `app-e2e` is not required yet.
3. No other doc or comment states, as the current state, that `app-e2e` is not required or that the ruleset does not require up-to-date branches. Dated research notes and plan history in `plans/frontend-v1/` stay as they are, except its "Still open" list, which marks frontend#64 done.
4. This PR's checks include `app-e2e`, and it passes.

## Steps

- [x] Update the ruleset with `gh api -X PUT repos/openpickleball/frontend/rulesets/26885653`, keeping every other field, and read it back (done before the branch was cut).
- [x] Rewrite the comment in `.github/workflows/ci-app.yml`.
- [ ] Open the PR and confirm `app-e2e` runs and is required on it.

## Files that change

- `.github/workflows/ci-app.yml`: the comment above `jobs:` only.
- `plans/frontend-v1/plan.md`: the frontend#64 line under "Still open" says it is done.
- `plans/main-ruleset-strict-e2e/plan.md`: this plan.

## Risks

- A wrong check name would block every PR forever. The name `app-e2e` and app id 15368 were read from the check runs on PR #221.
- Strict mode means every PR must be rebased or updated once `main` moves. That is the intent of Q5.
- Admins keep the "always" bypass, so the founding-phase direct pushes to `main` still work.

## Proof

- Criterion 1: `gh api repos/openpickleball/frontend/rulesets/26885653` read back after the PUT shows `strict_required_status_checks_policy: true` and the four checks, with rule types `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` and the same bypass actor.
- Criterion 2: the diff of `ci-app.yml`, and the workflow still parses (`actionlint` or a YAML load).
- Criterion 3: `grep -rn -i "not required yet\|required status\|ruleset" .github AGENTS.md CLAUDE.md CONTRIBUTING.md app/AGENTS.md app/README.md site/AGENTS.md` shows no stale current-state line.
- Criterion 4: `gh pr checks` on this PR lists `app-e2e` as passing and required.

## Decisions

- The ruleset was changed with `gh api` rather than in Settings, with the owner's approval (2026-11-26). The copy from before the change was saved outside the repo.
