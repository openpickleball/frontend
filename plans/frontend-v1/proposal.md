# Frontend v1 proposal

**Status:** approved 2026-11-17

> Owner answers in `plan.md` override this doc. The offline queue (Q1) is deferred to frontend#33.

Inputs: `plan.md`, `research/backend-api.md`, `research/design.md`, `research/app-and-ci.md`, `plans/frontend-stack/decision.md`, frontend#22, backend source on `main`. Library versions were checked with `npm view` on 17 Nov 2026.

## Summary

Scope:

- **Auth, end to end:** sign up (email and password, then birth month and year, which the backend checks before anything else, then gender, first and last name, an optional city, and agreement to the Terms of Service and Privacy Policy), the "check your email" page, verify email from the link, log in and out, and password reset. Built on allauth headless with the `browser` client, same origin through the Vite dev proxy.
- **Record a match:** singles or doubles, teams entered as OPEN codes, 1 to 5 games, client-side score rules that mirror the backend, then `POST /matches/`.
- **My matches:** a paged list from `GET /players/{code}/matches`, match detail built from list data, and confirm or dispute.
- **Profile and ratings:** the backend now has `me/player` (backend#124). The app reads and changes it with the generated types (frontend#207), and creates the player after signup with `POST me/player` (frontend#205). Ratings (backend#53) don't exist yet, so the ratings card is built against MSW handlers that only run in mock mode. With the real backend it says ratings aren't live yet.
- **Installable PWA:** a manifest, a service worker that caches the app shell, and the site's design tokens and theme toggle. The offline match queue was proposed as the last v1 item (Q1), and is deferred to frontend#33.

### Decisions at a glance

| # | Decision | Recommendation | Owner input? |
| --- | --- | --- | --- |
| 1 | Scope | Build auth, record match, my matches and confirm/dispute now. Build profile and ratings against mocks. Search, inbox and match-by-code are blocked | y (Q1–Q4) |
| 2 | UI library | shadcn-svelte (Bits UI 2), copied into `ui/` and restyled to the site's tokens. No second palette | n |
| 3 | Layering | `api/` → `domain/` → `features/` → `routes/`, with `ui/` beside them. Enforced by `eslint-plugin-boundaries` | n |
| 4 | API client | openapi-typescript + openapi-fetch from committed schema snapshots. One `AppError` type. CSRF middleware | n |
| 5 | Data and rendering | SPA: `adapter-static` with a fallback page, `ssr = false`. Load functions plus small runes stores. No TanStack Query yet | n |
| 6 | Validation and forms | Zod 4 for form input and domain rules. Plain runes forms, no Superforms | n |
| 7 | Mocking | MSW 3 + openapi-msw. Modes `off`, `missing` and `all`. The same handlers serve tests, demos and missing endpoints | n |
| 8 | PWA | SvelteKit's built-in service worker and a static manifest. API is network-only. Offline queue (deferred to frontend#33) | y (Q1) |
| 9 | Testing | Vitest for unit tests, Vitest browser mode for components, Playwright at phone size against MSW, axe in e2e | n |
| 10 | CI hardening | Concurrency, timeouts, fail on warnings, e2e job, coverage, schema drift check. Two settings need an admin | y (Q5) |
| 11 | Cleanup | One housekeeping PR: stale plans, `design/` prototypes, the old app favicon, launch.json | n |
| 12 | Issues | 6 new backend issues, comments on #124 and #42, 5 frontend follow-ups | n |

---

## 1. Scope

| Feature | Status | Backend | Notes |
| --- | --- | --- | --- |
| Sign up, verify email, log in/out, reset password | **Build now** | allauth `/_allauth/browser/v1/` | Pages must sit at the `FRONTEND_URL` paths the backend emails: `/account/verify-email/{key}`, `/account/password/reset`, `/account/password/reset/key/{key}`, `/account/signup` |
| Session restore and route guard | **Build now** | `GET auth/session` | A 401 with `flows` is a state, not an error (for example, "verify your email") |
| App shell, nav, theme toggle, tokens, fonts | **Build now** | — | Port `site/src/input.css` `@theme`, the `light:` variant and the head script |
| Record a match | **Build now** | `POST /matches/` | 422 field errors go to their form fields. A 409 `duplicate_match` links to the earlier match |
| Confirm my own submission | **Done by the backend** | `POST /matches/` | A self-submission is created `pending` and needs a confirmation from each team (ADR 0015). Since backend#197 the submission counts as the submitter's team confirmation, and the app's extra confirm call was removed in frontend#208. Players still confirm matches the other team submitted. See Q4 |
| My matches (paged) | **Build now** | `GET /players/{code}/matches` | "Load more" with `limit`/`offset`. Needs my own code, see Q3 |
| Match detail | **Build now** | from list data | Cached by code from the list and from mutation responses. A cold deep link scans my list (up to 100) and otherwise shows "not found" |
| Confirm / dispute | **Build now** | `/confirm`, `/dispute` | Dispute asks first in an alert dialog. Repeats do nothing on the backend, so the buttons show on every pending match |
| Another player's confirmed matches | **Build now** | same list endpoint | Page `/players/{code}`. Their name comes from the participant data. Private players return 404, and we show "not available" |
| Offline match queue | **Deferred to frontend#33** (was: build last) | `POST /matches/` | Q1. IndexedDB, flushed when the app opens and on `online` |
| Create/view my Player profile, onboarding | **Built on the real endpoint** for view and edit (frontend#207), and for create after signup (frontend#205) | backend#124 `POST/GET/PATCH /me/player` | Without it a new account can't submit matches (403) |
| Public player profile header | **Build against mock** | backend#124 `GET /players/{code}` | |
| Ratings card and history | **Build against mock** | backend#53 (needs #45) | Labeled as demonstration ratings, as #53 requires. Real mode shows "Coming soon" |
| Opponent search by name | **Blocked** | new issue B1 | v1 uses code entry with paste and format check |
| "Waiting for me" inbox, already-confirmed state | **Blocked** | new issues B2, B3 | v1 sorts pending matches first |
| Open a match by code with no list | **Blocked** | new issue B4 | Workaround above |
| Edit or void a match | **Blocked, out of v1** | no API (service only) | |
| Clubs, events, account deletion | **Out of v1** | #125, #116 | |

**Ratings presentation.** The site never shows the 2.0–8.0 scale, and its rule is "only say what is true today." So ratings don't appear against the real backend. In mock mode they render with a "Sample data" badge. The UI matches #53's planned shape: per format, the rating, reliability, provisional status, last updated, and a demonstration flag.

**Local dev with a linked Player.** `seed_dev_data` creates Players, each with an Account, and confirmed matches. But the command prints no logins, the emails are Faker-generated, and no allauth `EmailAddress` row is verified, so mandatory verification blocks the first login. The password is the factory default in `apps/accounts/tests/factories.py`. The backend now has `POST /api/v1/me/player`, which creates the Player from the signup details held in the session after the email is verified. The app calls it when `GET me/player` finds no Player (frontend#205), and asks for the required details when the session holds none. Until B5 lands, `app/README.md` documents a one-off `manage.py shell` snippet. It marks the first few seeded accounts verified and prints each email with its player code.

## 2. UI library

**Recommendation: shadcn-svelte 1.8 (CLI) on Bits UI 2.21.** Components are copied into `src/lib/ui/` as our own code, so we restyle them once to the site's look and own them from then on.

- **Why:** Bits UI handles the parts that are costly to get right for older and screen-reader users: dialogs, focus traps, popovers, menus, toggle groups and comboboxes. shadcn-svelte supports Tailwind 4 and Svelte 5 runes, and it adds no runtime theme layer. We pull in only what we use: Button, Input, Label, AlertDialog, Sheet, ToggleGroup, Tabs, Badge, Sonner (toasts), and Select if needed. Icons come from `@lucide/svelte`.
- **Token mapping:** the site's `@theme` block is the only palette, pasted into `app/src/routes/layout.css` unchanged. shadcn's names collide with ours: its `primary` is a button fill, while the site's `--color-primary` is the page background. So we **don't** adopt shadcn's `@theme inline` color names. As we copy each component in, we rewrite its classes to site utilities (`bg-primary`, `text-secondary`, `border-line`, `text-muted`). Dark mode needs no `.dark` class: `light-dark()` plus `color-scheme` and `[data-theme]` switch every token, and the `light:` variant covers the rare exception. We add `--color-danger` (light-dark, contrast-checked) for errors, use `--color-surface` for dialogs and sheets, and use `rounded-full` for buttons. Match status is shown as text with an icon, never as color alone.
- **Alternatives:** **Melt UI** (`melt` 0.44, pre-1.0 headless builders): good primitives, but we would write every component's markup and its API still changes. **Skeleton** (5.0): a full design system with its own theme engine that would fight the site's monochrome look. **Ark UI** (5.25): solid Zag state machines, but a heavier runtime and a smaller Svelte community. **Hand-rolled:** fine for buttons and inputs, too risky for dialogs and comboboxes.

## 3. Layering

```
src/lib/
  api/          transport only: generated types, openapi-fetch clients, CSRF middleware, AppError
    generated/  open.d.ts, allauth.d.ts (generated, committed)
    schema/     open.json, allauth.json (committed snapshots)
  domain/       pure TS, no Svelte: models, OPEN code parsing, score rules, Zod schemas, DTO→model mappers
  features/
    auth/       session.svelte.ts, services (allauth calls), components (LoginForm…), index.ts
    matches/    services, matches.svelte.ts (cache by code), components (MatchCard, ScoreEntry…), index.ts
    players/    profile + ratings (mock-backed), index.ts
    offline/    queue (IndexedDB), index.ts   # (deferred to frontend#33), not built in v1
  ui/           shadcn-copied primitives, layout pieces, theme toggle, cn()
  mocks/        MSW handlers, fixtures (made-up), browser.ts / node.ts setup
routes/         thin: load functions call feature services, pages compose feature and ui components
```

- **Models, DTOs and presentation:** DTOs are the generated `components['schemas']['MatchOut']` types and never leave `api/` or the mappers. Domain models are camelCase types with branded codes (`PlayerCode`, `MatchCode`) and derived fields (`winner`, `myTeam`, `isPending`). Presentation is formatting (dates, "11–7, 9–11, 11–5") and lives in components or `features/*/format.ts`.
- **Import rules:**

| Layer | May import |
| --- | --- |
| `domain` | nothing in `lib`, except `import type` from `api/generated` (for the mappers) |
| `api` | `api` only |
| `ui` | `ui` only |
| `features/x` | `api`, `domain`, `ui`, its own files, other features only through their `index.ts` |
| `mocks` | `api`, `domain` |
| `routes` | `features/*/index.ts`, `domain`, `ui`. Never `api` directly |

- **Enforcement:** `eslint-plugin-boundaries` (7.4) with these element types. It's cheap if it resolves our `#lib/*` alias through the TS resolver. If that turns out to be fiddly, we fall back to `no-restricted-imports` patterns per folder (an hour's work). Because `domain/` and `api/` have no Svelte imports, a later Expo app can lift them into a shared package, as the stack decision wants.

## 4. API client

**Recommendation: `openapi-typescript` 7.13 (types) + `openapi-fetch` 0.17 (about 6 kB runtime), with `openapi-msw` for typed mocks.**

- **Why:** we commit only types, with no generated runtime code to review. Paths and operation IDs from ninja are explicit and stable. Middleware handles CSRF and error normalization, and the same types drive the MSW handlers.
- **Alternatives:** **hey-api** (`@hey-api/openapi-ts` 0.99): generates SDK functions and Zod schemas, but it's pre-1.0 and churns its config between minors. **orval** (8.48): generates clients and faker-based MSW mocks, but it's heavier and query-library-oriented, and faker mocks would put random data into screenshots.
- **Schema snapshot:** commit `src/lib/api/schema/open.json` and `allauth.json`. Scripts:
  - `pnpm api:pull` fetches `http://127.0.0.1:8000/api/v1/openapi.json` and `/_allauth/openapi.json` from a running local backend, then formats them.
  - `pnpm api:gen` runs `openapi-typescript` on both into `src/lib/api/generated/`.
  - CI runs `api:gen` and `git diff --exit-code` on that folder, so types can't drift from the committed snapshot. Drift against the backend itself waits for backend#42 (schema export in CI).
- **allauth:** OPEN serves allauth's spec (`HEADLESS_SERVE_SPECIFICATION = True`), so allauth gets its own generated file and its own `openapi-fetch` client with base `/_allauth/browser/v1`. The spec also lists endpoints OPEN disables (phone, codes, sessions). We wrap only the eight we use in `features/auth/services.ts`. If the spec turns out not to generate cleanly, we hand-write types for those eight.
- **One error type.** Middleware and a `toAppError()` turn every failure into this:

```ts
type AppError = {
  kind: 'network' | 'unauthenticated' | 'forbidden' | 'csrf' | 'not_found'
      | 'conflict' | 'duplicate' | 'validation' | 'server';
  status: number | null;          // null for network failures
  code: string;                   // backend code, e.g. 'duplicate_match', 'tie'
  message: string;                // safe to show
  fields: Record<string, string[]>; // 'games.1' ← ninja 'body.games.1'; allauth 'param'
  flows?: AllauthFlow[];          // allauth 401: pending 'verify_email' etc.
};
```

  - **Ninja errors** are `{code, message, errors[{field, code, message}]}`. We strip the `body.` prefix from `field`. A 403 whose message names CSRF becomes `csrf`, and we retry it once after refetching the token.
  - **allauth errors** are `{status, errors[{code, param, message}]}`, or a 401 with `data.flows`. A 401 with flows is handed back as session state, not shown as an error.
  - **Non-JSON responses** (a 405 in plain text, Django's HTML 404, a 500) become `server` or `not_found` with a generic message. A `fetch` rejection becomes `network`, which the offline queue keys on (deferred to frontend#33).
- **CSRF:** at startup, `GET /_allauth/browser/v1/config` sets the `csrftoken` cookie (we confirm this in the first auth task). Middleware on both clients copies the cookie into `X-CSRFToken` on POST, PATCH and DELETE. The cookie name is a constant, because backend#102 may add a `__Host-` prefix. The Vite proxy for `/api` and `/_allauth` → `127.0.0.1:8000` keeps `changeOrigin: false`. The `Host` header then stays `localhost:5173` and matches `Origin`, so Django's origin check passes without `CSRF_TRUSTED_ORIGINS`. The backend `.env` needs `FRONTEND_URL=http://localhost:5173`.

## 5. Data fetching and rendering

**Recommendation: SPA mode.** We use `@sveltejs/adapter-static` 4.0 with `fallback: 'index.html'` and `export const ssr = false` in the root layout. Universal `+page.ts` load functions call feature services, and after a mutation we call `invalidate()`. A small runes store per feature caches matches by code, which match detail needs. The session lives in a runes store, filled once from `GET auth/session`.

- **Why SPA:** frontend#22 expects a static build with the API on the same origin, and hosting is out of scope. Auth is a browser cookie, so a server render would only forward it. The pages that would gain from SSR (shareable profiles and leaderboards with link previews) need backend#124 and #53 first. A static shell is also the simplest thing for a service worker to cache.
- **Alternatives:** **adapter-node with SSR:** revisit when public profile pages exist and a host is chosen. Services take `fetch` as a parameter, so the switch is cheap. **TanStack Query** (`@tanstack/svelte-query` 6.4, runes-based): worth adopting when we add polling, many parallel queries or optimistic updates. For four screens it's one more concept than we need.

## 6. Validation and forms

**Recommendation: Zod 4 (4.6) at the input boundary and for domain rules. Plain runes form state, no Superforms.**

- **What we validate:** `domain/` holds `matchInputSchema` and the score rules, mirroring `apps/matches/services.py`: no ties, no negative scores, the winner reaches the target, win by 2, and past the target the game ends at exactly +2. It also holds OPEN code normalization (uppercase, hyphen grouping, check character as in `apps/public_ids/codes.py`) and the auth form schemas. The server stays the authority, and its 422 `fields` map back onto the same field names.
- **Responses** are trusted through the generated types and mappers, not parsed at runtime. That keeps the bundle small, and the CI drift check protects the types.
- **Forms:** a small `createForm()` helper in `ui/` holds values, touched state and errors in runes. Five forms don't justify more.
- **Alternatives:** **Valibot** (1.5): smaller bundles, but fewer contributors and AI tools know it well. **Superforms** (3.1): its main value is progressive enhancement through server actions, which SPA mode doesn't have.

## 7. Mocking

**Recommendation: MSW 3.0 + `openapi-msw` 2.1, so handlers are typed by the same generated paths.**

- `src/lib/mocks/handlers/` has one file per area. `fixtures/` holds made-up players (Faker-free hand-written names such as "Robin Vale", with valid-format codes) and matches in every status.
- Mode `PUBLIC_API_MOCK`, read in `hooks.client.ts`:
  - `off` (default): no MSW.
  - `missing`: MSW serves only the endpoint the backend lacks (today `players/{code}/ratings`), plus the place search so a mock run never reaches the real Photon, and passes everything else to the real backend.
  - `all`: no backend needed, for demos, mockup screenshots and e2e.
- The handlers for missing endpoints use hand-written provisional types in `api/provisional.ts`. Since frontend#207 it holds only the ratings types (#53). We delete it when the ratings endpoint ships and the snapshot is regenerated.
- Vitest uses `msw/node` with the same handlers. A page can't run two service workers at the same scope, so mock modes don't register the app's service worker.
- **Alternative:** a feature-flagged in-app adapter for each port. That means more code paths in production, and it can't exercise the real fetch, CSRF and error pipeline.

## 8. PWA

**Recommendation: SvelteKit's built-in service worker and a static `manifest.webmanifest`. No plugin.**

- **Manifest:** name and short name "OPEN", `display: standalone`, `start_url` and `scope` `/`, and black theme and background colors (the dark base). Icons are 192, 512 and 512 maskable. `brand-assets` is empty, so we render the icons from `site/public/assets/img/favicon.svg` with `design/tools/export-logo.py`. `app.html` gets the theme-color metas and the no-flash theme script.
- **Service worker:** scope `/`. It precaches `immutable` and `assets` from `$app/manifest` under a cache keyed by `version` (from `$app/env`). Navigations fall back to the cached `index.html`. `/api/` and `/_allauth/` are network-only: we never cache authenticated responses. An "Update available" toast prompts `skipWaiting`. The worker isn't registered in MSW modes.
- **Kit 3 decisions (T10):** `$service-worker` is gone, so the worker uses `$app/manifest`, `$app/service-worker` and `$app/env`. It lives in `src/service-worker/` with its own tsconfig, and `pnpm check` type-checks it. Auto-registration is off (`serviceWorker.register: false`). `hooks.client.ts` registers it only when `PUBLIC_API_MOCK` is `off` and not in dev. Icons are rendered from the app favicon with headless Chromium (`pnpm icons`), not `design/tools/export-logo.py`.
- **Offline match queue (Q1), (deferred to frontend#33); not built in v1. Design kept for reference:** a submission that fails with `network` is stored in IndexedDB through `idb-keyval` 6.3. The app retries it when it opens, on `online`, and when the user taps "Retry". iOS has no Background Sync, as frontend#22 notes.
  - A 409 `duplicate_match` naming the player's own match counts as sent.
  - A 401 keeps the item and asks the player to log in.
  - A 422 moves the item to "Needs fixing".
- **Alternative:** `@vite-pwa/sveltekit` 2.0 (Workbox, supports Kit 3). It's more config and another dependency, and all we need is shell caching. Reconsider if we want push notifications or asset generation.

## 9. Testing

| Level | Tool | What |
| --- | --- | --- |
| Unit | Vitest 5.1 (node) | domain rules, code parsing, mappers, `toAppError`, queue logic (with `fake-indexeddb` if needed) |
| Component | Vitest browser mode: `@vitest/browser-playwright` 5.1 + `vitest-browser-svelte` 3.1, Chromium | forms, score entry, dialogs. Bits UI needs real focus and pointer events, which jsdom fakes badly |
| E2E | `@playwright/test` 1.65, projects for Pixel 7 (Chromium, required) and iPhone 15 (WebKit, local or nightly) | auth flows, record → confirm, list paging, theme (offline queue e2e (deferred to frontend#33)). Runs against `vite build` + `preview` with `PUBLIC_API_MOCK=all` |
| PWA | Playwright, real service worker build, `page.route` for the API | installability (manifest), offline shell (queue flush (deferred to frontend#33)) |
| Live | `pnpm e2e:live`, local only | one happy path against the real local backend with a seeded login. Not in CI, because CI has no backend |
| A11y | `@axe-core/playwright` 4.14 on every e2e page, `svelte-check --fail-on-warnings` | WCAG 2.1 AA, with no exemptions unless they're written down |

Alternative for components: jsdom with `@testing-library/svelte` 5.4. It's faster, but it misses real layout and focus behavior. Coverage uses `@vitest/coverage-v8`, reported with no threshold at first.

## 10. CI hardening

From `research/app-and-ci.md` §4:

| Change | Admin needed? |
| --- | --- |
| `concurrency` (cancel stale PR runs) and `timeout-minutes: 15` on `ci-app.yml` | no |
| `svelte-check --fail-on-warnings` | no |
| A new `app-e2e` job: Playwright browser cache, build, Pixel 7 project, axe, and an uploaded report on failure | no to add, **yes to make it required** |
| Schema drift check (`api:gen` + `git diff --exit-code`) in `app-checks` | no |
| Coverage summary, and uploading `build/` as an artifact | no |
| `pnpm audit --prod --audit-level=high`, non-blocking | no |
| Ruleset: require branches to be up to date (`strict`), essential with three agents merging in parallel | **yes** |

Not now: path filters on required checks, Renovate, preview hosting.

## 11. Cleanup (one housekeeping PR, first)

- `app/src/lib/assets/favicon.svg`: replace with `site/public/assets/img/favicon.svg` (it's the retired logo).
- `design/content-v2.html`, `design/shared.css`, `design/marks.html`: delete. They're a stale second palette (lime, 16px radii), and git keeps the history. Keep `design/icon-d.html`, `design/tools/` and `design/assets/`. Note the copies are identical to `site/`'s.
- `plans/consolidate-repos/plan.md`: rewrite the Goal and decisions for one page, and leave the three admin items for the owner to verify.
- `plans/app-migration/plan.md`: mark it superseded by frontend#22 and backend#182 (app at `app.openpb.org`, `site/` stays).
- `plans/frontend-stack/decision.md` and `plan.md`: status decided (SvelteKit, PWA, Capacitor deferred, 2026-11-17), and the open questions answered.
- `plans/about-redesign/plan.md`: move "Carry it into app/" here, and rename the mentions of an external rating system.
- `plans/teaser-content/plan.md`: add a "superseded by `site/src/input.css`" note, and drop the patent line.
- `plans/site-content-v2/plan.md`: fix step 3 to `data-tally-form`, and re-check the external-name wording.
- `.claude/launch.json`: rename `teaser` to `site`.
- Outside the PR (owner, local): prune the three stale `.claude/worktrees/*`, delete the local `open-ui` clone, and decide whether to populate or remove `brand-assets`.

The starter files (`+page.svelte`, `layout.css`, `app.html`, `adapter-auto`) are replaced by the scaffolding task, not by this PR.

## 12. Issues to file

**Backend (`openpickleball/backend`), new:**

- **B1** *Player search by display name for picking opponents.* Signed-in only, minimal fields, respects privacy.
- **B2** *"Waiting for my confirmation" list, or a `status` filter on `players/{code}/matches`.* Pending matches the viewer hasn't acted on.
- **B3** *Viewer-aware fields on `MatchOut`.* `my_team`, `my_decision` (confirm/dispute/none), confirmed-per-team, and `created_at`.
- **B4** *`GET /api/v1/matches/{code}` for participants.* Same 404 rules as the list.
- **B5** *`seed_dev_data`: print dev logins with verified emails and linked Players.* So the frontend can log in locally without shell work.
- **B6** *`.env.example`: SvelteKit dev defaults.* `FRONTEND_URL=http://localhost:5173`, and document the same-origin proxy.

**Backend, comment on existing issues:**

- #124: ask that `GET /me/player` (or `accounts/me`) return the player code. Without it, "my matches" can't find the player.
- #42: ask to commit `openapi.json` so the frontend can check for drift.
- #53: confirm the response shape we mock.
- ADR 0015: ask whether submitting should count as the submitter team's confirmation (Q4).

**Frontend (`openpickleball/frontend`):**

- **F1** Offline match queue: filed as frontend#33 (Q1 = defer).
- **F2** Revisit SSR (adapter-node) for public profile and leaderboard pages once #124 and #53 ship and a host is chosen.
- **F3** Swap the mocks for real endpoints when #124 and #53 land: regenerate the schema, delete `provisional.ts`. Done for #124 in frontend#207. Ratings (#53) remain, in frontend#35.
- **F4** Keep `tailwindcss` in step across `app/` and `site/` in Dependabot (one group across directories, or a CI check that the versions match).
- **F5** Update frontend#22's "Done when": replace the staging criterion with local dev until hosting is in scope.

## 13. Open questions for the owner

1. **Offline match queue:** build it last in v1, or defer it to F1? (*v1* / *defer*). Recommended: **v1**. Answered: defer, frontend#33.
2. **Ratings against the real backend:** "Coming soon" card, or hide it entirely? (*card* / *hide*). Recommended: **card**.
3. **Until backend#124:** have players type their own OPEN code once (stored on the device) so "my matches" works? (*yes* / *no*). Recommended: **yes**.
4. **After submitting a match:** should the app confirm for the submitter's team automatically? (*yes* / *no*). Recommended: **yes**, with "you're confirming this score" shown on the submit button.
5. **Ruleset:** turn on "require up to date" and make `app-e2e` a required check? (*yes* / *no*). Recommended: **yes** (needs a repo admin).
