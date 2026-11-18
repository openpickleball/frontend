# Frontend v1 tasks

Source of truth for implementation. Tracking issue: frontend#48. Read `plan.md` (decisions) and `proposal.md` (architecture) first. Mockups are in `mockups/`; the component inventory and token additions are in `mockups/README.md`.

## How tasks run

- One task = one GitHub issue = one branch = one PR, following `CONTRIBUTING.md`. Branch names are `issue-<N>-<slug>`. The PR fills in `.github/PULL_REQUEST_TEMPLATE.md`, says `Closes #N`, and gives `plans/frontend-v1/plan.md` as the plan. Comment on the issue to claim it when work starts.
- Each task lists the files it **owns**. Only that task edits them while it's open. `app/package.json` and `app/pnpm-lock.yaml` are shared: rebase on `main` and run `pnpm install` before pushing, and never hand-merge the lockfile.
- Done means: acceptance criteria met, `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm build` pass in `app/`, commits are signed off (`git commit -s`), the PR links this file, and the task's line here is ticked in the same PR.
- An Opus agent reviews every PR. The orchestrator merges after CI is green and the review approves. This is an owner-approved exception to "a maintainer merges every PR" for v1 (plan.md, Decisions).
- Copy rules from `CONTRIBUTING.md` apply in the app too: no em dashes, plain words for players, never call anything an "OPEN rating", don't name competing rating systems.
- Made-up data only.

## Waves

A wave starts when everything it depends on has merged. Tasks within a wave run in parallel.

| Wave | Tasks | Depends on |
| --- | --- | --- |
| 0 | T0 | — |
| 1 | T1, T2, T3 | T0 (T3 also needs the schema snapshot) |
| 2 | T4, T5 | T4: T1. T5: T3 |
| 3a | T6, T9 | T1, T2, T5 |
| 3b | T7, T8 | T6, T9 |
| 4 | T10, T11 | T7, T8 |

## Tasks

### T0 · Housekeeping, plan docs and CI basics — `chore/v1-housekeeping`
- [x] Commit `plans/frontend-v1/` (plan, research, proposal, mockups, this file).
- [x] Cleanup per `proposal.md` §11: replace `app/src/lib/assets/favicon.svg` with the site favicon. Delete `design/content-v2.html`, `design/shared.css` and `design/marks.html`. Update the stale plans (`consolidate-repos`, `app-migration`, `frontend-stack`, `about-redesign`, `teaser-content`, `site-content-v2`). Rename `teaser` to `site` in `.claude/launch.json` if that file is tracked.
- [x] `ci-app.yml`: `concurrency` that cancels in-progress PR runs, `timeout-minutes: 15`, and `svelte-check --fail-on-warnings` (through `pnpm check` or a CI flag).
- **Owns:** `plans/**`, `design/**`, `.github/workflows/ci-app.yml`, `app/src/lib/assets/favicon.svg`.
- **Accept:** CI is green. No live link or instruction points at a deleted file.

### T1 · App shell and design system — frontend#37
- [x] SPA mode: `@sveltejs/adapter-static` with `fallback: 'index.html'`, and `ssr = false` in the root `+layout.ts`.
- [x] `layout.css` already has the `@theme` block, fonts and `color-scheme` base rules (frontend#14, `plans/app-theme/`). Keep them and their test in `layout.test.ts`. Add the `light:` variant and the token additions from `mockups/README.md` (confirmed, disputed, danger, field, washes), and extend the test to cover them.
- [x] `app.html`: the no-flash theme script that sets `data-theme`, the `theme-color` metas and the font preloads, the same as `site/`. Keep the body classes from #14. (Font preloads are skipped: Vite fingerprints the fonts, so `app.html` can't name their built URLs. The reason is in a comment there.)
- [x] Replace the placeholder home page from frontend#15 (`plans/app-page-title/`) with the shell's home stub. Keep the `OPEN Pickleball` title and the description, and update `page.test.ts`.
- [x] shadcn-svelte init, plus Button, Input, Label, Badge, AlertDialog, Sheet, ToggleGroup and Sonner in `src/lib/ui/`, restyled to the site utilities (`proposal.md` §2). Theme toggle.
- [x] App shell from the mockups: top bar and bottom tab bar on mobile, side nav from 960px. Stub routes `/`, `/record`, `/matches`, `/matches/[code]`, `/profile` and `/account/*`, each with a heading only.
- [x] `eslint-plugin-boundaries` with the import rules in `proposal.md` §3 (empty folders are fine).
- **Owns:** `app/svelte.config.js`, `app/src/app.html`, `app/src/routes/+layout.*`, `app/src/routes/+page.svelte`, `app/src/routes/page.test.ts`, `app/src/routes/layout.*`, `app/src/lib/ui/**`, `app/static/**`, `app/eslint.config.js`, the route stubs.
- **Accept:** the shell matches `mockups/home.html` at 390px and 1280px in both themes (screenshot in the PR). The theme toggle persists. The build output is static.

### T2 · Domain layer — frontend#38
- [x] `src/lib/domain/`: branded `PlayerCode` and `MatchCode`, with normalization and the check character copied from backend `apps/public_ids/codes.py`.
- [x] Score rules mirroring backend `apps/matches/services.py`: no ties, the winner reaches the target, win by 2, and past the target the game ends at exactly +2. Games to 11, 15 or 21; 1–5 games.
- [x] Zod schemas: `matchInputSchema` and the auth forms. Domain models `Match`, `Team` and `Player`, with derived fields (`winner`, `myTeam`, `isPending`).
- [x] Unit tests ported from the backend's score and code tests (cite them).
- **Owns:** `app/src/lib/domain/**`.
- **Accept:** no Svelte imports. Every backend validation case has a matching test.

### T3 · API layer — frontend#39
- [x] Commit the schema snapshots `src/lib/api/schema/open.json` and `allauth.json`. This needs a running backend or ninja's `export_openapi_schema`. See "Blockers".
- [x] Scripts `api:pull` and `api:gen` (openapi-typescript) → `src/lib/api/generated/`.
- [x] openapi-fetch clients for `/api/v1` and `/_allauth/browser/v1`, CSRF middleware, and `toAppError()` with the `AppError` type (`proposal.md` §4). Unit tests for every error shape.
- [x] Vite dev proxy for `/api` and `/_allauth` → `127.0.0.1:8000`, with `changeOrigin: false`.
- [x] CI: run `api:gen`, then `git diff --exit-code src/lib/api/generated`.
- **Owns:** `app/src/lib/api/**`, the proxy block in `app/vite.config.ts`, the drift step in `ci-app.yml`.
- **Accept:** the generated types are committed and CI catches drift. `toAppError` covers ninja 422, 403 CSRF, 409 duplicate, the allauth 401 with flows, non-JSON responses and network errors.

### T4 · Test infrastructure and the e2e job — frontend#40
- [x] Vitest browser mode (`@vitest/browser-playwright`, `vitest-browser-svelte`) as a second project next to node, with one example component test.
- [x] Playwright: a Pixel 7 project that runs against `vite preview` with `PUBLIC_API_MOCK=all`, axe on every page, and a shell smoke test.
- [x] A new `app-e2e` job in CI with a cached browser and the report uploaded on failure. Add coverage (v8) to the summary, with no threshold.
- **Owns:** `app/playwright.config.ts`, `app/e2e/**`, the test sections of `app/vite.config.ts`, the `app-e2e` job.
- **Accept:** `app-e2e` passes on the PR. Afterwards, the owner makes it required and turns on "require up to date".

### T5 · Mocks — frontend#41
- [x] MSW 3 and openapi-msw handlers for every endpoint in use, plus `api/provisional.ts` types for `me/player`, `players/{code}` and ratings (shapes from backend#124 and #53).
- [x] Hand-written fixtures: fictional players and matches in every status. Code formats match the backend.
- [x] Modes `PUBLIC_API_MOCK=off|missing|all`, set up in `hooks.client.ts`. `msw/node` setup for Vitest.
- [x] DTO to domain mappers (`domain/mappers.ts` and its test), moved here from T2 because they were left over there.
- **Owns:** `app/src/lib/mocks/**`, `app/src/hooks.client.ts`, `app/src/lib/api/provisional.ts`, `app/src/lib/domain/mappers.ts`.

### T6 · Auth — frontend#42
- [x] `features/auth`: a session store filled from `GET auth/session`, and services for signup, login, logout, verify email, password reset request and reset with key. There is no resend service: this backend confirms by link and its resend call always answers 409. The "check your email" screen tells players to sign in again, which sends a new link.
- [x] Pages at the backend's email paths (`/account/signup`, `/account/verify-email/[key]`, `/account/password/reset`, `/account/password/reset/key/[key]`) plus `/account/login`. A route guard on the signed-in routes.
- [x] Every state in `mockups/auth.html`, adjusted to the real backend (verifying an email or resetting a password does not sign anyone in). Component tests and an e2e test of signup → verify → login on mocks.

### T9 · Profile and own code — frontend#43
- [x] `features/players`: the "my OPEN code" store, filled from `me/player` when it exists (mock) and otherwise from a one-time entry kept in localStorage.
- [x] `/profile`: the code with Copy and Share, the match count, and a "Ratings aren't live yet" card. In mock mode, a sample rating card labelled as sample data. Never call it an "OPEN rating" (`CONTRIBUTING.md`).
- [x] The one-time code entry prompt, shown when signed in with no code.

### T7 · Record a match — frontend#44
- **Overrides the mockups** (plan.md Q1, Q4): the record button says the player is confirming the score; after submit the match waits only on the other team (the "recorded" state in `match.html` must not ask the submitter to confirm); no offline queue (frontend#33).
- [x] `/record` per `mockups/record.html`: singles or doubles, players entered by code as chips (the user's own code prefilled), date, game settings, add and remove games, and inline validation from T2.
- [x] Submit → `POST /matches/` → confirm for the user's own team (Q4) → match detail with a toast. The button says the user is confirming the score.
- [x] 422 errors mapped onto their fields, and a 409 duplicate linked to the existing match. Offline shows an error (no queue, Q1).

### T8 · My matches, detail, confirm and dispute — frontend#45
- **Overrides the mockups** (plan.md Q1, Q4): a match the user just submitted waits only on the other team, so the "recorded" state in `match.html` must not ask the submitter to confirm; no offline queue (frontend#33).
- [x] `features/matches`: list service with "load more", and a cache by code.
- [x] Home (needs confirmation first, then recent), `/matches` paged per `mockups/history.html`, `/matches/[code]` per `mockups/match.html`. Cold deep links fall back to scanning the user's list.
- [x] Confirm, and dispute through an AlertDialog (a Sheet on mobile). Empty and error states.
  - Note: a single AlertDialog meets "a Sheet on mobile". Its content is a bottom sheet under 640px and a centered dialog above, so one component serves both and keeps the alert dialog's focus and Escape behavior.

### T10 · PWA shell — frontend#46
- [x] `manifest.webmanifest` and icons rendered from the favicon (192, 512, 512 maskable).
- [x] `src/service-worker.ts`: precache the build and static files, navigation fallback, `/api` and `/_allauth` network-only, an "Update available" toast. Not registered in mock modes.
- [x] A Playwright check for installability and the offline shell.

### T11 · Local dev docs and a live happy path — frontend#47
- [x] `app/README.md`: running the backend locally, `.env` values, a shell snippet that verifies the seeded accounts and prints their logins (until backend issue B5), and the mock modes.
- [x] `pnpm e2e:live`: one happy path against the local backend. Local only, not run in CI.

## Blockers

- **Schema snapshot (T3):** cleared. `uv` is installed (0.13.9). T3 runs `uv sync` in `../backend` and exports the schema with ninja's `export_openapi_schema` or from a local `runserver`.
