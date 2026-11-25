# Plan: Create the player after email verification with POST /api/v1/me/player (issue #205)

**Status:** active

Risk tier: High. It creates player records, applies the backend's age refusal, adds a stateful form to every page that needs the player's own code, and reshapes the mock session. Confirmed by the user.

Domain skills:
- superpowers:test-driven-development: invoke (every behavior change gets a failing test first).
- frontend-design: invoke for the new details form and the refusal and unverified states (follow the existing signup and profile look; no new visual language).
- impeccable: not applicable because the form reuses existing field components and tokens.
- django, django-allauth, django-ninja-api, django-celery: not applicable because the backend is only read, never changed.

## Goal

After a player signs up, verifies their email and signs in, the app creates their player with `POST /api/v1/me/player` and shows their OPEN code. Today it never calls the endpoint, so the signup details are dropped and `/record` asks for a code the player does not have.

All paths are under `app/` unless they start with `../`.

## Acceptance criteria

1. On a 404 from `GET me/player`, `MyCode.load()` calls `POST me/player` with `{}` once per load. A 201 shows the server code with no prompt (`status 'ready'`, `source 'server'`).
2. A 409 from the POST calls `GET` again and shows that player. If the `GET` still finds none, the status is `error`.
3. A 422 with any item of code `missing` gives status `needs-details`. `OwnCodeGate` then shows a form with only these fields: birth month (select) and year, gender division (Man/Woman, values `mens`/`womens`) and display name. Submitting POSTs only those four values. Each field shows its own error from the 422.
4. The age refusal 422 (one item on `birth_month`, code `invalid`, message `"This birth year and month can't be used."`, the backend's `UNDER_MINIMUM_AGE_MESSAGE`) gives status `refused`. It shows a plain message, no form and no code prompt, and it still holds after a reload and after signing out and in (in the mock, as the backend's session flag does).
5. A 404 or 405 from the POST, or a 405 from the GET, gives `unavailable` (a backend older than backend#124): today's device code and prompt, unchanged.
6. A 401 gives `signed-out`. A 403 (email not verified) gives a new `unverified` status with its own copy and Try again. A network failure or a 5xx gives `error`.
7. Two loads or gates at once send at most one POST in flight per `MyCode`. A late load never overwrites a newer one (the `#run` counter).
8. The mock signup holds the details for the new account's email. For an address that is already taken, the hold is bound to no account, unless the session already holds details for that address (then they are kept, as the backend's `_is_held_for_login` does). Logout drops the hold and keeps `signupRefused`. Every age refusal (age check, signup, create) drops the hold.
9. The mock POST follows `create_my_player` in this order: 403 unverified, 409 (drops the hold), the sticky refusal, then the hold if present, else the body. From the hold, the legal name is "First Last". The display name is the legal name for an adult, or "First L." for ages 13 to 17 (the first last-name character that renders, plus its combining marks). City and region come from the hold, and privacy starts `private` for a minor. A 201 drops the hold; any other failure keeps it.
10. The mock store's `restore` loads old snapshots that have no hold field, and drops a snapshot whose hold has the wrong shape.
11. After the player is created, `ProfileSettings` loads the real settings, once. It says "You can't change ... yet" only when that is true: an older backend, with the code from this device. Under any status but `ready` it shows no settings section.
12. Docs that would become false are fixed. The full gate passes.

## Files that change

- `src/lib/features/players/services.ts`:
  - `fetchMyPlayer({api})` returns `MyPlayer | 'none' | 'unavailable'` (404 is `'none'`, 405 is `'unavailable'`). A code that fails to parse becomes a `server` `AppError` (today it silently returns null).
  - New `createMyPlayer(body: PlayerCreateIn = {}, {api})` returns `{kind:'created', player} | {kind:'conflict'} | {kind:'needs-details', fields} | {kind:'refused'} | {kind:'unavailable'}` and throws an `AppError` for anything else. It reads the raw openapi-fetch 422 (`ErrorResponse` items `{field, code, message}`), because `AppError.fields` drops item codes. Field messages come from `toAppError(error, response).fields`, which strips `body.`. Export `AGE_REFUSAL_MESSAGE` with a comment naming the backend constant. If the backend changes that copy, the failure is mild: the form shows the message under Month.
  - `fetchMySettings` is unchanged.
- `src/lib/features/players/my-code.svelte.ts`: statuses `needs-details`, `refused`, `unverified`; `detailErrors`, `detailProblem` and `submitDetails(values)`; new dep `createMyPlayer`; a `#creating` promise for the dedupe. The device fallback runs only for `unavailable` or a network failure. `reset()` clears the new state. Rewrite the class comment.
- `src/lib/features/players/player-details-form.svelte` (new): a `FieldSet`/`FieldLegend` "Birth month and year" with `SelectField` (month) and `TextField` (year, `inputmode="numeric"`, `autocomplete="bday-year"`); a `RadioGroup` Gender with Man/Woman laid out as in `signup-details-step.svelte`; `TextField` Display name with `DISPLAY_NAME_MAX`; a `Button` with a `Spinner`. `gap-4` between fields, `gap-8` between groups, `max-w-md`.
- `src/lib/features/players/settings.ts`: `checkDetails(values)`, a client check for the required fields with the backend's four messages ("Enter a display name.", "Enter your birth year.", "Enter your birth month.", "Choose a gender division."), reusing `checkDisplayName`.
- `src/lib/features/players/own-code-gate.svelte`: branches for `needs-details` (the form), `refused` and `unverified`. Copy, plain, with no em dashes and no rating claims:
  - Form heading "Finish your player profile". Intro: "We need your birth month and year, gender and a display name again. This can happen if you confirmed your email on another device."
  - Refused: "We can't create a player profile with these details." (mirrors signup's "We can't create an account with these details.").
  - Unverified: says the email is not verified yet, with Try again.
- `src/lib/features/players/profile-settings.svelte`: load with an `$effect` once `myCode.status` is `ready`, and again only for a different code, instead of `onMount`. Show "Name and privacy" only for that code, while it is `ready` (or the gate is checking it again). Under any other status there is nothing true to say yet, so the section is hidden (review finding R2: the "not available yet" line showed while the player was being created).
- `src/lib/features/players/index.ts`: update the doc comment.
- Consumers: `features/matches/components/code-gate.svelte` (home, history and match views) renders through the gate. `routes/record/+page.svelte`, `profile-view.svelte`, `home-view.svelte` and `routes/+layout.svelte` need no change (`reset()` covers the new state).
- Move `features/auth/components/text-field.svelte` and `select-field.svelte` to `src/lib/ui/field/` and export them from its `index.ts` (the boundary rules stop `features/players` importing from `features/auth`). Update the auth imports. Move the `MONTHS` list from `signup-details-step.svelte` to `src/lib/domain/birth.ts` (exported from the domain index) with a `GENDER_OPTIONS` list; signup uses both.
- `src/lib/mocks/store.ts`: `MockState.signupHold?: {email: string | null; birthYear; birthMonth; genderDivision; firstName; lastName; city; region} | null`. New `holdSignup(email, details)` and `refuseSignup()` (sets the flag and drops the hold); a hold path and the 403 in `createMyPlayer`; `logout()` drops the hold; `signup()` binds or keeps the hold as in criterion 8; `restore` validates the hold. Fix the header comment ("The store keeps none of those").
- `src/lib/mocks/handlers/allauth.ts`: the signup handler passes the cleaned names, city and region to `store.signup`. All three refusal sites call `store.refuseSignup()`.
- `src/lib/mocks/player-rules.ts`: `minorDisplayName(first, last)` using `hasVisibleCharacter`.
- Older-backend switch for e2e and the live drive: `window.__openMock.olderBackend()` in `mocks/browser.ts` sets a persisted `state.olderBackend`, and the `me/player` handlers in `handlers/open.ts` then answer 404. Mock only.
- Docs: `README.md` ("Your own OPEN code" and the `LIVE_OWN_CODE` row), `../plans/frontend-v1/proposal.md` ("Local dev with a linked Player"), the `e2e-live/happy-path.spec.ts` comment.

## Order of work (TDD)

1. Pure moves: the field components and the month and gender lists. Auth tests stay green.
2. Mock store tests in `integration.test.ts` and `age-check.test.ts`, failing first: hold to 201 (adult and minor names, city, private privacy); a body sent with a hold is ignored; a taken address gets no hold; a repeated signup keeps its hold; logout drops the hold but keeps the refusal; 409 drops the hold; a 422 keeps it; every refusal drops it; 403 for an unverified account. Then a `restore` test. Then the code.
3. `services.test.ts` for `fetchMyPlayer` and `createMyPlayer`, each result kind (stub with `server.use` for 404, 405, 500 and a network error). Then the code.
4. `my-code.test.ts`: each transition in criteria 1 to 7, the dedupe and a stale run. Then the code.
5. `own-code-gate.svelte.test.ts` and a new `player-details-form.svelte.test.ts` (fields, client errors, server field errors, refused copy). Then the components. The axe check runs in e2e only: the component tests have no axe runner, and adding one is out of scope.
6. `profile-settings.svelte.test.ts`: reload after creation.
7. The older-backend switch, then e2e, then docs.

### Existing tests whose expectation changes

- `services.test.ts`, "fetchMyPlayer > is null for an account with no player (404)": now expects `'none'`.
- `my-code.test.ts`, the "myCode without me/player" block, and every other fake `fetchMyPlayer` that returned `null` (rename, reset and forget): it returns `'unavailable'` instead. The device behavior stays tested.
- `e2e/profile.spec.ts`, "an account with no player yet (me/player answers 404)": the two code prompt tests move under `olderBackend()`. "says name and privacy settings are not available yet" becomes the details form test, with a copy under `olderBackend()`.
- `e2e/auth.spec.ts`, "sign out removes the saved code and email from this browser": runs under `olderBackend()`.
- `integration.test.ts`, "accepts a body with a city and region, and a body with neither, and keeps neither": the city and region are now held for the create, so it expects them in `signupHold` (found while building step 2).
- Unchanged: settings-store "is unavailable when the backend has no me/player", profile-settings "says the settings are not available yet", integration "is a 404 for an account with no player".

## Risks

- Riskiest step: step 4. Every gate (home, history, match, record, profile) goes through `load()`. A loop or a missed status leaves a page stuck loading. One POST per load, the dedupe and `#run` guard it.
- The refusal is matched on the backend's message, the only signal that tells it from an ordinary month error.
- Moving the field components touches every auth form. The auth tests and e2e are the regression check.
- A live account with no player and no hold now gets the form instead of the code prompt. Seeded players are not affected.
- Not doing: asking for a legal name or city, changing the backend, a resend flow for 403, calling the POST from the signup screens.

## Proof

- Criteria 1 to 7: `services.test.ts`, `my-code.test.ts`, the gate and form component tests.
- Criteria 8 to 10: `integration.test.ts`, `age-check.test.ts` and the store `restore` test.
- Criterion 11: `profile-settings.svelte.test.ts`.
- e2e: extend "sign up, verify the email from the link, sign in, then sign out" so `/record` shows the code chip and no "Enter your OPEN code" heading before signing out. New: verify the unverified fixture with its key, then sign in; the form shows, an empty submit shows field errors, a filled one shows the code on `/profile`, axe passes. New: an under-13 year in the form gives the refusal, and it survives a reload.
- Live drive (`PUBLIC_API_MOCK=all pnpm dev`, verify keys from `window.__openMock.mail()`):
  - Happy path: sign up as an adult, open the verify link, sign in, open `/record`. The chip shows with no prompt, and the network panel shows GET 404 then POST `{}` 201. `/profile` shows "First Last" and editable settings. A 15-year-old signup shows "First L.".
  - Missing details: sign in, sign out, sign in again (the hold is gone), or use the verified fixture. The form shows; an empty save gives field errors; a filled save gives the code.
  - Refusal: an under-13 year in the form shows the message; a reload, a sign out and in, and a new signup are all refused.
  - 409: a console POST after creation gets a 409; a reload still shows the code.
  - Older backend: `__openMock.olderBackend()`, reload `/record`, the code prompt shows.
- Measured on `origin/main`: none needed. No planned test asserts that two inputs behave alike or that a phrase is absent from real output.

## Steps

- [x] Plan approved and committed
- [x] Implementation, tests and gate
- [ ] Review, verification and docs
- [ ] PR open and green

## Decisions

- **Minimal form when details are missing (user, 2026-11-25).** Ask only what the backend requires: birth month and year, gender division and a display name. The legal name and city stay empty.
- **A 404 from GET is ambiguous.** An older backend also answers 404 there, so only the POST's 404 or 405 means "no endpoint".
- **Field components move to `ui/field`.** `features/players` may not import `features/auth`, and copying them would mean two versions to maintain.
- **Only a missing detail opens the details form (review finding R3).** `createMyPlayer` returns `needs-details` only for a 422 with a `missing` item, and `invalid` for any other 422 but the age refusal. On `load()`, `invalid` from `POST {}` ends in a new `not-created` status: the backend used the details it holds from signup and ignores the body, so a form could never succeed. The gate says "We can't create your player profile from your signup details." and points to info@openpb.org. On `submitDetails()`, field errors from any 422 still show on the form.
