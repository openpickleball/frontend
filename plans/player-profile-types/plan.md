# Plan: Use the generated types for the player profile endpoints (issue #207)

**Status:** active

Risk tier: High. It switches `features/players` from hand-written to generated API types, reshapes the mock player model and the `missing` mock mode, and touches more than a few files across `api/`, `features/players` and `mocks/`. Confirmed by the user.

Domain skills:
- superpowers:test-driven-development: invoke (every behavior change gets a failing test first).
- frontend-design, impeccable: not applicable because no screen changes.
- django, django-allauth, django-ninja-api: not applicable because the backend is only read, never changed.

## Goal

backend#124 shipped `GET`, `POST` and `PATCH /api/v1/me/player` and `GET /api/v1/players/{code}`. The app and its mocks use the generated types and the real shapes for them, so frontend#205 can call `POST /api/v1/me/player`. Only the ratings endpoint stays provisional (frontend#35, backend#53).

## Acceptance criteria

1. `app/src/lib/api/schema/open.json` and `app/src/lib/api/generated/open.d.ts` are regenerated from backend `main` at a9620f0 with `pnpm api:pull && pnpm api:gen`, and committed. Re-running `pnpm api:gen` changes nothing.
2. `features/players/services.ts` calls `api.open` (not `provisionalApi`) for `GET` and `PATCH /api/v1/me/player`, typed by the generated `MyPlayerOut`, `PlayerUpdateIn` and `PrivacyOut`. `fetchMyPlayer`, `fetchMySettings` and `updateMySettings` take an optional `ApiOption` as their last argument, as the README requires of every service that calls `api`. `fetchRatings` still uses `provisionalApi`.
3. `provisional.ts` holds only the ratings types and the `/api/v1/players/{code}/ratings` path. `Visibility`, `PrivacySettings`, `MyPlayerOut`, `MyPlayerCreateIn`, `MyPlayerUpdateIn`, `PlayerProfileOut` and the `me/player` and `players/{code}` paths are gone from it. Nothing in `src/` imports those names from `api/provisional`.
4. `mocks/handlers/provisional.ts` serves only `/api/v1/players/{code}/ratings`. The `me/player` (GET, POST, PATCH) and `players/{code}` handlers live in the typed open handlers (`openHttp`, generated paths) and answer with the real shapes:
   - `MyPlayerOut`: `code`, `display_name`, `legal_name`, `birth_year`, `birth_month`, `gender_division`, `city`, `region`, `privacy` (`PrivacyOut`). Empty optional text is `""`. No `home_club`.
   - `PlayerProfileOut`: `code`, `display_name`, `city`, `region`. `city` and `region` are `null` when `city_region_visibility` hides them from the viewer, or when they are empty. The owner always sees their own.
   - Every one of them needs a session (401 without one, before anything else) and, for `POST` and `PATCH`, a valid CSRF token (403), like the other open handlers.
5. Mock `POST /api/v1/me/player` follows the backend's body path (the mock store holds no signup details): `display_name`, `birth_year`, `birth_month` and `gender_division` (`mens` or `womens`) are required, unknown keys are refused, all with 422 and per-field items under `body.`. A second player for the account is a 409. A birth year and month under 13 or in the future is the fixed age refusal 422, and sets the same `signupRefused` flag signup uses, so later creates in the session get it too.
6. Mock `PATCH /api/v1/me/player` changes only the fields sent. `birth_year`, `birth_month` and `gender_division` are refused with 422 whatever the value, and so are unknown keys. A null `display_name` is refused, a null `legal_name`, `city` or `region` clears it. Privacy values other than `signed_in` and `private` are refused with items under `body.privacy.`. A 422 changes nothing. 404 when the account has no player.
7. The mock store and fixtures keep the new profile fields per player (legal name, birth year and month, gender division, city, region) with made-up values, and no `homeClub`. The store's player types come from the generated schema, not from `provisional.ts`. Saved `sessionStorage` snapshots from the old shape are dropped by `restore`, not loaded.
8. `PUBLIC_API_MOCK=missing` (`createMissingHandlers`) serves only the ratings endpoint and Photon. `me/player` and `players/{code}` go to the real backend. The standalone stand-in for `me/player` and `players/{code}` is gone. The ratings standalone sample stays.
9. Absorbed schema changes in the mocks:
   - Mock `POST /api/v1/matches/` records the submitter's confirmation for their team, as backend #197 does. So mock `GET /api/v1/me/matches/awaiting-confirmation` no longer lists a match the viewer submitted, and a match submitted and then confirmed by the other team becomes confirmed.
   - The mock's 409 `duplicate_match` item carries `existing_code` with the earlier match's code. The mock's submitter always played in the duplicate (same lineup), so the backend would always name it.
   - `MatchFormat` changed only its description, so nothing changes for it. The schema-drift test still passes.
   - The app's record-match flow is left as it is: its follow-up `POST matches/{code}/confirm` is now a no-op on the backend. A follow-up issue removes it (user decision, see Decisions).
10. `api/README.md` and the comment at the top of `provisional.ts` say only ratings remain provisional (frontend#35). `app/README.md`'s `missing` row stays true.
11. The full gate passes: `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm e2e`.

## Files that change

All paths under `app/`.

- `src/lib/api/schema/open.json`, `src/lib/api/generated/open.d.ts`: regenerated (criterion 1). Already produced in the worktree by the coordinator; commit them first, as they are.
- `src/lib/api/provisional.ts`: ratings only, new header comment.
- `src/lib/api/index.ts`: `provisionalApi` stays (ratings), comment updated.
- `src/lib/api/README.md`: the `provisional.ts` and `ApiOption` bullets.
- `src/lib/features/players/services.ts`, `services.test.ts`: `api.open` with `ApiOption` for `me/player`; tests use a client from `createApi` against the mock server, or a stubbed `Api`, instead of mocking `provisionalApi` for those calls. Keep the ratings tests on `provisionalApi`.
- `src/lib/features/players/types.ts`: `Visibility` may alias the generated `Visibility`; `PrivacyKey` keeps `home_club` because `PrivacyOut` still has `home_club_visibility`.
- `src/lib/features/players/index.ts`, `ratings.ts`, `ratings-card.svelte`, `ratings-card.svelte.test.ts`: only if their imports from `api/provisional` name removed types.
- `src/lib/mocks/handlers/open.ts`: add `GET`/`POST`/`PATCH /api/v1/me/player` and `GET /api/v1/players/{code}`.
- `src/lib/mocks/handlers/provisional.ts`: ratings only. `STANDALONE_EMAIL` and `standalone` stay only if the ratings handler still needs them (it does, for `sampleRatings` of unknown codes in `missing` mode).
- `src/lib/mocks/handlers/index.ts`: comments for `createHandlers` and `createMissingHandlers`.
- `src/lib/mocks/store.ts`: `MockPlayer` with the new fields, `myPlayerOut`, `createMyPlayer`, `updateMyPlayer`, `publicProfile` with the real shapes and rules; `submitMatch` records the submitter's confirmation; `restore` rejects old-shape snapshots.
- `src/lib/mocks/responses.ts`: `duplicateMatch` adds `existing_code`.
- `src/lib/mocks/validation.ts` (or a new helper next to it): body validation for `PlayerCreateIn` and `PlayerUpdateIn`, if the handlers grow too long.
- `src/lib/mocks/fixtures.ts`, `fixtures.test.ts`: player fixtures with the new fields, `PrivacyOut` from the generated schema.
- `src/lib/mocks/integration.test.ts`: the `provisional endpoints` block becomes a `player profile endpoints` block against the typed client (`api.open`), plus the new cases below. Its `fetchJson` helper goes if nothing else uses it.
- `src/lib/mocks/http.ts`: `provisionalHttp` stays for ratings.
- e2e: `e2e/profile.spec.ts` only if a shape it reads changed. The record-match e2e only if it asserted the submitted match on the home awaiting list.

## Order of work

1. Commit the regenerated `open.json` and `open.d.ts` alone. Run `pnpm check` and record what breaks (expected: nothing yet, since the app does not use the new paths).
2. Mock store and fixtures: the new player model and outputs (tests first in `integration.test.ts` for the shapes in criteria 4 to 7).
3. Move the handlers into `handlers/open.ts`, strip `handlers/provisional.ts` to ratings, update `createMissingHandlers` (criterion 8, with a test that the missing handler set has no `me/player` or `players/{code}` handler).
4. `features/players/services.ts` on `api.open` with `ApiOption`, and its tests (criterion 2).
5. Trim `provisional.ts` and `api/index.ts`; delete every import of the removed names (criterion 3). `pnpm check` must pass.
6. Match changes in the mocks: submitter confirmation and `existing_code` (criterion 9), tests first.
7. Docs named in criterion 10.
8. Full gate, then the live drive.

## Risks

- **Mock snapshot in `sessionStorage`.** A browser tab from before this change restores players with `homeClub` and no `city`. `restore` must drop such a snapshot (criterion 7), or the profile page could show `undefined`.
- **`missing` mode now depends on the real backend for `me/player`.** Run against a backend older than backend#124, the profile page gets the real 404 and shows the "enter your code" prompt. That is acceptable: `missing` means "the backend has the rest".
- **e2e for the profile page** signs in as the fixture player and reads `me/player`. The shape changes, so the profile e2e is the main regression check for criterion 2.
- **Submitter confirmation in the mock** changes what the home screen's awaiting list shows right after recording a match. The record-match flow still calls confirm, which the mock treats as a repeat (no new decision, no error). Any test that expected the submitted match to need the submitter's confirmation must change, and that change is the point of criterion 9, not a weakened test.
- **The age refusal flag** is shared with signup. Setting it from `POST me/player` must not break `age-check.test.ts`.
- Riskiest step: step 3, because it changes which handlers exist in each mock mode; a missed handler shows up only as an unhandled request in the browser.

What this plan does not do: call `POST me/player` after signup (frontend#205), anything about ratings (frontend#35), remove the record-match follow-up confirm (follow-up issue), hold signup details in the mock store (frontend#205 needs that, not this issue).

## Proof

- Criterion 1: `pnpm api:gen` then `git status --porcelain src/lib/api/generated` is empty.
- Criteria 2, 3: `services.test.ts` (calls go to `api.open`, a passed `api` is used), `pnpm check`, and `grep -rn "MyPlayerOut\|PrivacySettings\|MyPlayerUpdateIn\|MyPlayerCreateIn\|PlayerProfileOut" src --include='*.ts' --include='*.svelte'` showing no import from `api/provisional`.
- Criteria 4 to 7: `integration.test.ts` cases: 401 without a session on all four; `GET me/player` shape (every `MyPlayerOut` key, no `home_club`); `POST` 201 with the body path, 422 for each missing required field, unknown key, bad gender division, 422 age refusal and the sticky flag, 409 second create; `PATCH` changes only sent fields, 422 for `birth_year`, `birth_month`, `gender_division`, unknown keys, null `display_name`, bad privacy value, and that a 422 changed nothing; `PATCH` null clears `city`; `GET players/{code}` city and region visible to a signed-in viewer, null when `city_region_visibility` is `private` (owner still sees them), null when empty, 404 for an inactive account and a bad code. A `store` test that `restore` rejects an old-shape snapshot.
- Criterion 8: a test that `createMissingHandlers()` answers ratings and leaves `me/player` unhandled.
- Criterion 9: integration tests that a submitted match is not on the submitter's awaiting list, is on the opponent's, becomes confirmed after one opponent confirm, and that the 409 item has `existing_code`.
- Criterion 11: the gate output, every command.
- Live drive (High: changed path plus failure and edge paths), with `PUBLIC_API_MOCK=all` and `pnpm dev`: sign in as the fixture player, open `/profile`, change the display name and a privacy setting, reload and see both kept; try an empty display name and see the field error; sign in as the unverified fixture account after verifying it and see the no-player prompt (404 path); record a match and see the home screen does not ask the submitter to confirm it. With `PUBLIC_API_MOCK=missing` and no backend running, see `me/player` reach the network (not the mock) in the network panel.

Measured on the default branch: no planned test asserts that two inputs behave alike or that a phrase is absent from real output, so nothing to measure.

## Decisions

- **Record-match follow-up confirm stays (user, 2026-11-24).** The backend now counts a submission as the submitter's confirmation and treats the app's extra confirm as a no-op. This issue updates only the mocks. A follow-up issue removes the extra call.
- **Risk tier High (user, 2026-11-24).**
- **The mock `POST me/player` uses the body path only.** The mock store keeps no signup details today, and holding them belongs with frontend#205, which wires signup to `POST me/player`.
- **`me/player` services take `ApiOption`.** The README asks it of every service that calls `api`, and the `provisionalApi` exception ends here for these calls.
