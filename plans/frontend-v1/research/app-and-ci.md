# Research: app/ state, tooling and CI

Surveyed 2026-11-17 on `main` (bd2de2c).

## Summary

1. `app/` is an untouched `sv create` starter (one placeholder page, one SSR smoke test). All five CI commands pass locally.
2. Stack: SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.7, Tailwind 4.3.5, TypeScript 6.0.3, Vitest 5.1.0, `adapter-auto` (no real target yet). No UI kit, API client, PWA code, Playwright or coverage.
3. Vitest runs in `node` with no browser mode and no Svelte component testing library, so only SSR rendering and pure TS can be tested today.
4. One CI workflow for the app (`app-checks`: format, lint, check, test, build), required with `sign-off` and `teaser-build` via the "Protect main" ruleset (0 required approvals, non-strict). Nothing else gates PRs.
5. `plans/app-migration` and `plans/frontend-stack` are stale versus the decisions (PWA on `app.openpb.org`, SvelteKit chosen) and are already contradicted by frontend#22 and backend#182.

## 1. app/ today

| Item | Value |
| --- | --- |
| SvelteKit / Svelte / Vite | 3.1.1 / 5.57.3 / 8.3.7 (runes forced on for project code) |
| Tailwind | 4.3.5 via `@tailwindcss/vite`, exact pin (must match `site/`); `layout.css` is only `@import 'tailwindcss'` (no `@theme` yet) |
| TypeScript | 6.0.3, `strict`, extends `$app/tsconfig` |
| Adapter | `@sveltejs/adapter-auto` 8.0.0. Build prints "Could not detect a supported production environment" (harmless). A static/SPA decision is open (see frontend#22) |
| Lint / format | ESLint 10.14 (flat config: js, typescript-eslint, eslint-plugin-svelte recommended + prettier), Prettier 3.9.10 + prettier-plugin-svelte |
| Test | Vitest 5.1.0 only. No `@testing-library/*`, `jsdom`, `happy-dom`, `@vitest/browser`, `@vitest/coverage-*`, Playwright |
| Runtime deps | none (all 18 packages are devDependencies) |
| Not installed | UI kit, icons, charts, validation (Zod/Valibot), OpenAPI client generator, PWA plugin (`@vite-pwa/sveltekit`), i18n |
| Package manager | pnpm 12.18.0 pinned in `packageManager`, `engineStrict`, minimatch overrides in `pnpm-workspace.yaml`, `allowBuilds: esbuild` |
| Import alias | `#lib`, `#lib/*` through package.json `imports` (not `$lib`) |

src contents (all starter):

| Path | Status |
| --- | --- |
| `src/routes/+page.svelte` | Placeholder "Welcome to SvelteKit" (frontend#15 to replace title/description) |
| `src/routes/+layout.svelte` | Imports `layout.css`, favicon link, renders children |
| `src/routes/layout.css` | `@import 'tailwindcss'` only |
| `src/routes/page.test.ts` | One test: `render(Page)` from `svelte/server` contains `<h1` |
| `src/lib/index.ts` | Comment only |
| `src/lib/assets/favicon.svg`, `static/robots.txt` | Starter |
| `src/app.html` | Standard; has `<meta name="text-scale" content="scale">`; no manifest, theme-color or icons |
| `src/app.d.ts` | Standard empty `App` namespace |

Verification (run in `app/`, all on current main):

| Command | Result |
| --- | --- |
| `pnpm format:check` | pass (a first run triggered an implicit `pnpm install`; lockfile unchanged, git status clean) |
| `pnpm lint` | pass |
| `pnpm check` | pass, 207 files, 0 errors, 0 warnings |
| `pnpm test` | pass, 1 file, 1 test, ~0.3 s |
| `pnpm build` | pass (client largest chunk 39.7 kB / 14.7 kB gzip; adapter-auto message only) |

## 2. Testing setup

| Aspect | State |
| --- | --- |
| Config | `test` block inside `vite.config.ts` (`defineConfig` from `vitest/config`): `include: src/**/*.{test,spec}.{js,ts}`, `environment: 'node'` |
| Browser mode / jsdom | None. Component tests can only use `svelte/server` `render` (SSR string). No DOM interaction possible |
| Svelte test helpers | No `@testing-library/svelte`, no `svelte` client mount config (would need `resolve.conditions: ['browser']` or Vitest browser mode) |
| E2E | None (no Playwright, no `e2e/` dir) |
| Coverage | None (no provider, no threshold) |
| Test file pattern gotcha | Include only matches `.js/.ts`, so `*.svelte.test.ts` works but `*.test.svelte.ts` rune-using test files need the Svelte plugin (present via sveltekit()) |

Gap for v1: need a DOM-capable component test setup (Vitest browser mode with Playwright provider, or jsdom + testing-library), Playwright for PWA/offline/e2e, and MSW or a fake for API mocking.

## 3. CI

Triggers and jobs:

| Workflow | Job (check name) | Trigger | What it does |
| --- | --- | --- | --- |
| `ci-app.yml` | `app-checks` | PR (no path filter), push to main on `app/**`/`.nvmrc`/workflow, manual | Frozen install, `format:check`, `lint`, `check`, `test`, `build` in `app/`. Never deploys. `contents: read` |
| `dco.yml` | `sign-off` | PR | `gh api` over PR commits, fails if non-merge commit lacks `Signed-off-by` |
| `deploy-pages.yml` | `teaser-build`, `deploy` | PR (build only), push to main on `site/**` (deploy), manual | Builds `site/`, uploads Pages artifact, deploys on non-PR. Concurrency group `pages-<ref>`, no cancel |
| `scorecard.yml` | `analysis` | `branch_protection_rule`, weekly cron, push to main, manual | OpenSSF Scorecard, SARIF to code scanning |

All actions are pinned to commit SHAs with version comments. Dependabot (`.github/dependabot.yml`): weekly npm for `/app` and `/site` (minor/patch grouped), weekly github-actions grouped. No Renovate.

Branch rules (`gh api repos/openpickleball/frontend/rulesets`, readable; classic branch protection returns 404, not used):

| Rule in "Protect main" (active, no bypass for current user) | Value |
| --- | --- |
| Deletion, non-fast-forward | blocked |
| Pull request required | 0 approvals, dismiss stale reviews on push, no code owner review, no thread resolution required, merge/squash/rebase allowed |
| Required status checks | `sign-off`, `app-checks`, `teaser-build`; `strict` (up-to-date branch) = false |

Gaps for a multi-agent PR workflow:

| Gap | Present? | Impact |
| --- | --- | --- |
| E2E tests (Playwright) | No | PWA, offline queue and responsive layouts untestable in CI |
| DOM component tests | No (node env) | See section 2 |
| Coverage report/threshold | No | No signal on untested code |
| Concurrency cancellation on `ci-app.yml` | No | Agents force-pushing waste runners; stale runs finish |
| Required check up-to-date (strict) | Off | Two parallel agent PRs can each pass and break main together |
| Preview build artifact | No (`build` only, nothing uploaded) | Reviewers/agents cannot open the built app |
| Dependency audit | No (`pnpm audit` not run; Dependabot version updates only, security alerts depend on repo settings) | Vulnerable deps unnoticed between Dependabot runs |
| Svelte a11y lint | Partial. `svelte-check` surfaces Svelte compiler a11y warnings, but it runs without `--fail-on-warnings`, so warnings do not fail CI. No axe/Playwright a11y checks | frontend#16 a11y concerns could regress silently |
| Path filters | PR runs are intentionally unfiltered (required check). Cost: `app-checks` runs on site-only and docs-only PRs | Minor runner cost; correct choice |
| Timeouts | No `timeout-minutes` on `ci-app.yml` | Hung job holds runner 6 h |
| Lockfile/type of install | `--frozen-lockfile` used | Good |
| Pre-commit hook | Prettier + ESLint on staged files only; skipped without node_modules (worktrees) | Agents in fresh worktrees get no local gate; CI is the only gate |
| OpenAPI client drift check | No (client does not exist yet) | Will need a "regenerate and diff" step |
| Lighthouse/PWA audit | No | Installability regressions undetected |
| CODEOWNERS | None seen in `.github/` | Fine while review count is 0 |

## 4. CI hardening recommendations (ranked by value/cost)

| # | Change | Cost | Why |
| --- | --- | --- | --- |
| 1 | Add `concurrency: { group: app-ci-${{ github.ref }}, cancel-in-progress: true }` (PR runs only) and `timeout-minutes: 10` to `ci-app.yml` | Minutes | Cheap; stops stale runs from parallel agent pushes |
| 2 | Turn on "Require branches to be up to date" (`strict_required_status_checks_policy: true`) in the ruleset, or use a merge queue | Settings change | Prevents two green PRs that conflict semantically from landing together; essential with 3 agents merging in parallel. Needs owner (ruleset edit) |
| 3 | Add DOM-capable component tests plus Playwright e2e job (build, `vite preview`, run smoke + one mobile-viewport project, upload report on failure). Keep in the existing `app-checks` job or add a job and register it as required | 0.5-1 day | Only way to verify offline queue, service worker, forms, responsive layout. Browsers cache with `actions/cache` or `playwright install --with-deps chromium` |
| 4 | Make `svelte-check` fail on warnings (`--fail-on-warnings`) and add `@axe-core/playwright` checks to the e2e smoke tests | Minutes + part of #3 | Svelte compiler a11y warnings become gates; addresses older/screen-reader audience from the stack decision |
| 5 | Upload the `build` output (or Playwright report) as an artifact, and add `pnpm audit --prod --audit-level=high` as a non-required step | Minutes | Lets reviewers/agents inspect a build; audit catches advisories between Dependabot runs. Runtime deps are currently zero, so audit is low-signal until deps arrive |
| 6 | Add Vitest coverage (`@vitest/coverage-v8`), print summary in CI, no threshold at first, then a modest floor (e.g. lines 70%) on `src/lib/` once the API client and domain code exist | Hours | Signals untested logic without blocking the starter |

Not recommended now: path filters on the required check (explicitly avoided in the workflow comment), Renovate (Dependabot covers it), preview hosting (hosting out of scope).

## 5. Plans to update or supersede

| Plan | Issue | Suggested change |
| --- | --- | --- |
| `plans/frontend-stack/plan.md` | Status `planned`, Decisions "None yet", steps unticked, still says "Proposed: SvelteKit ... Capacitor as the first step" | Mark SvelteKit decided (2026-11-17, project owner), status in `decision.md` to decided, Capacitor deferred. The "shared TypeScript core package" and "PWA manifest and service worker" steps move into the v1 plan/tasks. Step "update app-migration" is in scope for the v1 effort |
| `plans/frontend-stack/decision.md` | Status "proposed, not decided"; open questions unanswered; refers to `site/src/input.css` for tokens and assumes a separate core package | Record decision; answer open questions (backend is Django per backend issues, so no TS code sharing with the server; one MVP client, PWA) |
| `plans/app-migration/plan.md` | Moves app onto `openpb.org` itself, replaces the teaser; says "Choose a host" | Superseded in part by frontend#22 and backend#182: app goes to `app.openpb.org`, `openpb.org` keeps `site/`, API reached same-origin via `/api/`, `/_allauth/`, `/oauth/`. Hosting is out of scope for v1, but the plan's goal, domain section and "delete site/" step are wrong. The `@theme` copy and home-page rebuild steps are still plausible v1 inputs |
| `app/AGENTS.md` | Says app-migration "covers choosing a host and going live" | Fine until the plan is edited; update commands list when e2e/coverage scripts land |
| Root `AGENTS.md` | "Keep tailwindcss on same exact version in site/ and app/" | Unchanged; keep in mind when Dependabot bumps one side (grouped minor/patch per directory may bump them separately) |
| `plans/frontend-v1/plan.md` | Untracked on `main`, status active | Tick the research step once this file is committed |

Observation: Dependabot groups per directory, so `tailwindcss` bumps in `app/` and `site/` can land as two PRs with a temporary version mismatch.

## 6. Open GitHub issues and PRs relevant to the app

PRs: none open on either repo (`gh pr list` empty).

openpickleball/frontend (4 open issues):

| # | Title | Relevance |
| --- | --- | --- |
| 22 | Ship the app as a PWA at app.openpb.org | Core: manifest/icons from `brand-assets`, service worker for app shell, allauth `browser` client login flows, IndexedDB offline match queue (409 duplicate counts as sent), generated OpenAPI client, adapter choice (static build possible), update app-migration plan. Done when installable on Android/iOS and signup/login works on staging |
| 15 | Replace the SvelteKit placeholder page title and description | Starter cleanup (good first issue) |
| 16 | Accessibility check of the teaser site | Teaser, but sets a11y expectations |
| 19 | Link to the status page in the footer | Site footer; status page is backend#139 |

openpickleball/backend (46 open issues; app-relevant ones):

| # | Title | Relevance |
| --- | --- | --- |
| 182 | ADR: PWA for the MVP and the openpb.org subdomain layout | Records PWA at `app.openpb.org`, same-origin API, host-only `__Host-` cookies, `FRONTEND_URL`, passkey RP ID `openpb.org` |
| 183 | Serve the API on app.openpb.org and api.openpb.org | Routing of `/api/`, `/_allauth/`, `/oauth/` same-origin; unblocks staging login from the PWA |
| 124 | Player profile endpoints (p0) | Rating lookup |
| 125 | Organizer event endpoints (p0) | Events/matches |
| 108 / 111 / 113 | Epics: accounts/email/player API; hosting; stats, notices, rating seeds | Context |
| 117, 99, 100 | Passkeys (browser), MFA, account security | Login UX |
| 176-179 | Social login (shared setup, Google, Facebook, Apple) | Auth options |
| 114 | Age screen and 13+ signup rule | Signup form requirement |
| 116, 190 | Account deletion/retention; under-13 data removal | Privacy flows |
| 169, 157 | Profile pictures; player home club | Profile UI inputs |
| 102 | Production security settings (CSP, CORS, headers) | Constrains service worker, inline scripts, CSP nonces in SvelteKit |
| 139, 140 | Status page, rating freshness endpoint | Footer link (frontend#19) |
| 185 | Native app passkeys (later) | Out of scope |

Endpoint coverage is in `research/backend-api.md`.
