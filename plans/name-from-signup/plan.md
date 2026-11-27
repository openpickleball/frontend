# Plan: Replace the display name form with a last initial setting (issue #328)

**Status:** active

Risk tier: High. Not forced. Raised from Low for a changed API contract (backend#354), stateful UI (an optimistic switch with a lock), altering existing behavior (removing a page and a create form field), and many files.

Domain skills: frontend-design and impeccable: not applicable, the switch reuses `Switch`, `Field` and the existing privacy row pattern. chrome-devtools-mcp:a11y-debugging: invoke during the live drive to check the new switch, its locked state and its descriptions. django, django-ninja-api, django-allauth: not applicable here, the backend contract is built in backend#354. Others (Expo, React, Celery, FastAPI): not applicable, this is a SvelteKit app change.

## Goal

A player's name comes only from the first and last name given at signup, and players cannot edit it. An adult can choose to show their last name as an initial. A player aged 13 to 17 always shows "First L.", and nothing changes at 18. The backend builds the name and enforces the lock (backend#354). The app shows what the backend returns.

## Acceptance criteria

1. `/profile/name`, `NameSettings`, `DisplayNameForm`, `SettingsStore.saveName`, `myCode.rename`, `checkDisplayName` (if nothing else uses it) and `ROUTES.profileName` are gone, with their tests. The Profile page has no "Display name" row. `/profile/name` falls through to the app's normal not-found handling.
2. The Profile page's Account section shows a "Name" row with the name other players see (`display_name` from the backend), as text with no link and no input, and one plain line under it: "From your sign-up. It can't be changed."
3. Profile > Privacy (`/profile/privacy`) has a "Last name" switch row, first in the list, labelled "Show my last name as an initial". On means `name_format` `first_last_initial`, off means `full`. Its description shows the name other players see now ("Shown as Tam V."), taken from the backend's `display_name`. The app never builds the name.
4. When `name_format_locked` is true, the switch is on and disabled, with the line "This stays on until you turn 18." The app never judges an age. A backend refusal still shows in the privacy alert, like the other settings.
5. Turning the switch moves it at once, sends `PATCH /api/v1/me/player` with `privacy.name_format` only, and on success shows the name the backend returns, on the switch row and through `myCode.displayName` (Home greeting, Profile row). On failure the switch goes back and the backend's message shows in the alert (`privacy.name_format`).
6. The create-player details form (`player-details-form.svelte`, used when the session holds no signup details) asks for first name and last name instead of a display name, sent as `first_name` and `last_name`, with the same client checks and messages as signup's name fields. It no longer sends `display_name` or `legal_name`.
7. Mocks follow backend#354: the mock player stores first and last name; `display_name` is built from them and `name_format` (adult default `full`, 13 to 17 default `first_last_initial`); `GET` returns `name_format_locked`; `PATCH` refuses `display_name` and `legal_name` with the backend's 422, and `full` for a player aged 13 to 17 with the backend's message; `POST` takes `first_name` and `last_name`. Saved mock state from before the change is reset by `isMockPlayer`.
8. `open.json` and `open.d.ts` are regenerated from backend#354's `openapi/openapi.json` with `pnpm api:pull` and `pnpm api:gen`, never hand-edited.
9. Copy says "name", not "display name", wherever a player reads it, and is plain. No em dashes.

## Files that change

- `app/src/lib/api/schema/open.json`, `app/src/lib/api/generated/open.d.ts`: regenerated (criterion 8). Pull from the backend checkout on the backend#354 branch.
- `app/src/lib/features/players/types.ts`: `Privacy` gains `name: NameFormat` (`'full' | 'first_last_initial'`, from the generated `PrivacyOut`); `MySettings` keeps `displayName` and gains `nameLocked: boolean`; `MySettingsChange` loses `displayName`. Decide in implementation whether `name` sits in `Privacy` (shares `setVisibility`'s optimistic and overlap logic) or beside it; prefer reusing `setVisibility`'s machinery with a widened value type rather than a second copy.
- `app/src/lib/features/players/services.ts`: `toMySettings` maps `privacy.name_format` and `name_format_locked`; `toUpdateIn` maps the name setting and drops `display_name`; the create call sends `first_name` and `last_name`.
- `app/src/lib/features/players/settings-store.svelte.ts`: remove `saveName`; a change of the name setting updates `displayName` from the response and calls into `myCode` to update the shown name (replacing `rename`, or keep a renamed setter used only here).
- `app/src/lib/features/players/my-code.svelte.ts`: remove `rename()` unless the store needs a setter (then one, with a test).
- `app/src/lib/features/players/privacy-settings.svelte`: the new first row (criteria 3, 4).
- `app/src/lib/features/players/settings.ts`: remove `checkDisplayName` if unused; `checkDetails` checks first and last name with signup's rules (reuse the signup schema pieces in `app/src/lib/domain/schemas.ts`, do not copy them).
- `app/src/lib/features/players/player-details-form.svelte`: first and last name fields (criterion 6), `autocomplete="given-name"` / `"family-name"`.
- `app/src/lib/features/players/name-settings.svelte`, `display-name-form.svelte`, `app/src/routes/profile/name/+page.svelte`: deleted. `index.ts` export and doc comment updated.
- `app/src/lib/domain/routes.ts`: drop `profileName`.
- `app/src/routes/profile/+page.svelte`: drop the row, add the "Name" text row (criterion 2). `profile-view.svelte`: fix the stale "display name field" comment.
- `app/src/lib/mocks/store.ts`, `player-rules.ts`, `handlers/open.ts`, `fixtures.ts`: criterion 7. Fixtures use made-up names only.
- Tests: `settings-pages.svelte.test.ts`, `settings-store.test.ts`, `my-code.test.ts`, `settings.test.ts`, `services.test.ts`, `player-details-form.svelte.test.ts`, `integration.test.ts`, `handlers/index.test.ts`, `routes.test.ts`, `profile-page.test.ts`, `auth/guard.test.ts`, `e2e/profile.spec.ts`, `e2e/a11y.test.ts`.
- `plans/name-from-signup/plan.md`: this file.

## Order of work

0. Wait for backend#354's PR to have `openapi/openapi.json` with `name_format` and `name_format_locked`.
1. Regenerate the schema and types; `pnpm check` shows what breaks.
2. Services and types, TDD.
3. Mocks, TDD (`integration.test.ts`).
4. Settings store and `myCode`, TDD.
5. Privacy switch row, TDD (component tests: off, on, locked, revert on failure, name shown after save).
6. Remove the display name page, form and route; Profile "Name" row, TDD.
7. Create-player details form, TDD.
8. e2e and a11y updates.
9. Full gate, then the live drive.

## Risks

- Contract drift: if backend#354's final names differ from `name_format` / `name_format_locked`, follow the generated types and update this plan.
- The locked switch must not look like a broken control: disabled with a reason in its description, and `aria-describedby` points at it.
- The optimistic switch shows the old name until the response arrives. Show the name from the response, never a guess.
- Removing `rename` must not leave the Home greeting stale after a name format change.
- Old saved mock state without `name_format` must reset, not crash.
- Hard rule 6: the disabled switch is a convenience. The backend refuses `full` for a minor.

## Proof

- Criterion 1: route and profile page tests no longer list `/profile/name`; e2e signed-out and a11y lists drop it.
- Criterion 2: `profile-page.test.ts` reads the Name row text and finds no input or link in it.
- Criteria 3 to 5: component tests in `settings-pages.svelte.test.ts` for off, on, locked (disabled, note), a failed save (reverts, alert), and a success that shows the returned name; store tests for the request body `{ privacy: { name_format: ... } }`.
- Criterion 6: component and services tests for the two fields, their messages and the body.
- Criterion 7: mock integration tests for defaults, the lock, the refusals and the built name.
- Criterion 8: `pnpm check`; `git diff` of `open.json` matches the backend file.
- Live drive (High: changed path plus failure and edge paths), against `pnpm dev` in mock mode, and against the real local backend on the backend#354 branch if it runs: adult toggles on and off and sees the name change on Privacy, Profile and Home; a 13 to 17 player sees the locked switch; a forced PATCH of `full` for that player is refused; `/profile/name` shows not found. a11y check of the privacy page in both themes.
- Measured on `main` (2026-11-27): `pnpm test` in `app/`: 176 files, 2237 tests passed.

## Steps

- [x] Schema and types regenerated
- [ ] Services and types
- [x] Mocks
- [ ] Store and myCode
- [ ] Privacy switch
- [ ] Display name page removed, Profile Name row
- [ ] Create-player details form
- [ ] e2e and a11y
- [ ] Gate and live drive

## Decisions

- Names come only from signup and cannot be edited (project owner, 2026-11-27).
- Adults: "First Last" by default, with a switch for "First L." (project owner, 2026-11-27).
- 13 to 17: always "First L.", the switch shown locked; nothing changes at 18 (project owner, 2026-11-27).
- The switch lives on Profile > Privacy, first row, since it decides what other players see.
