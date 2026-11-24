# Plan: Ask for birth month and year, gender, and a confirmed password at signup (issue #197)

> Revised 2026-11-23 (revision 2, project owner): signup becomes two screens and also asks for first and last name, a location with suggestions, and agreement checkboxes. Criteria 1 and 9 are replaced and 11 to 18 added below. Sections marked "Revision 2" supersede the original text where they differ.

**Status:** active

Risk tier: High. Forced: the change touches authentication (the signup request and its error handling). It also changes an API contract and stateful form behavior.

Domain skills: django-allauth: not applicable to code here (the backend contract is already shipped and read from backend `apps/accounts/headless_views.py`, `apps/accounts/forms.py`, ADR 0017). frontend-design, impeccable: not applicable, the form reuses existing field components and tokens. chrome-devtools-mcp:a11y-debugging: invoke during the live drive to check the new fieldset's labels, descriptions and focus. Other listed skills (Django, Celery, Expo, React): not applicable, this is a SvelteKit app change.

## Goal

A player can create an account against the real backend. Signup has been broken since backend#114 made `birth_year` and `birth_month` required on `POST /_allauth/{client}/v1/auth/signup`.

## Acceptance criteria

1. (Revision 2) Signup has two screens on `/account/signup`. Screen 1: Email, Password, Confirm password, and a Continue button. Screen 2, in this order: birth month and year, then gender, first name, last name, location, the agreement checkboxes, and Create account, plus a Back button that returns to screen 1 with its values kept. Continue checks screen 1's fields on the client and sends nothing.
2. The signup request body carries `birth_year` and `birth_month` as integers and `gender_division`, next to `email` and `password`.
3. Before sending, the client checks the month (one of 1 to 12) and the year (a whole number, 1900 or later, not after the current year). A missing or invalid value shows a message on that field, focus moves to the first field in error (in page order: month, year, gender, email, password), and nothing is sent.
4. The client never checks the minimum age and no copy names it. The backend decides.
5. The backend's `birth_year` and `birth_month` field errors show on their fields, like the email and password errors do today.
6. The under-13 answer (400, code `signup_refused`, no `param`, message "We can't create an account with these details.") shows that message as the form-level alert and nothing more.
7. The allauth schema snapshot (`app/src/lib/api/schema/allauth.json`) and generated types match the running backend, and the typed call compiles with the new fields.
8. The MSW signup handler requires both fields with the backend's messages, and refuses an under-13 age with the same `signup_refused` answer. Mock mode e2e signup flows fill the new fields.
9. (Revision 2: the labels are "Man" and "Woman", and the missing message is "Choose man or woman."; the rest stands.) The form asks for gender as a required choice of "Men" or "Women" (a radio group, `#lib/ui/radio-group`), sent as `gender_division` `mens` or `womens`. Nothing chosen shows "Choose men or women." on the field, and nothing is sent. The backend's `gender_division` field error shows on the field. This criterion depends on backend#215 shipping; the request shape follows that PR's schema.
10. A "Confirm password" field follows Password. The client checks that the two match before sending ("The passwords don't match." on the confirm field) and sends only `password`. It has its own Show button, like Password. The email verification step (Check your email, then the emailed link) is unchanged.

11. (Revision 2) On screen 2, everything below the birth fields (gender, names, location, agreements, Create account) is disabled until the age passes the backend's age check (backend#223: `POST /_allauth/{client}/v1/auth/signup/age-check` with `birth_year` and `birth_month` only; 13 or older gets `200 {"status": 200}`, under 13 gets the 400 `signup_refused` answer and flags the session, malformed values get signup's field errors; it shares signup's rate limit). The check runs when the player presses a "Continue" button under the birth fields, after both pass the client checks of criterion 3. A button, not a blur, so it is explicit and works the same by keyboard. A pass enables the rest and locks the birth fields (with a "Change" link that re-locks the rest and asks again). A `signup_refused` answer shows the fixed message as the form alert and keeps the rest disabled. The client still never compares the age with a limit.
12. (Revision 2) First name and Last name: required text fields, `autocomplete="given-name"` and `"family-name"`, trimmed, with "Enter your first name." / "Enter your last name." when empty. Sent as `first_name` and `last_name` (backend#221). The backend's limits, checked on the client too with its messages: a first name of at most 61 characters ("Your first name can be at most 61 characters.", on `first_name`), and "First Last" of at most 64 characters ("Your first and last name together can be at most 63 characters.", on `last_name`). The backend also refuses a value that is not text ("Enter text.") or holds a control character; those show on their fields when the server sends them.
13. (Revision 2) Location: an optional combobox (`#lib/ui/combobox`) labelled "City (optional)". From 2 characters typed, and at most one request per 300 ms of typing, the app asks Photon (`https://photon.komoot.io/api/?q=<text>&limit=5&layer=city&lang=en`) and lists "City, Region, Country" suggestions. Choosing one sets both `city` and `region`; typing alone never does. Leaving the field empty sends no `city` or `region`. Text in the field with no suggestion chosen shows "Choose your city from the list, or clear the field." on the field and nothing is sent. The app never sends Photon anything before the age check passes, and never sends coordinates, a street or a postcode to the backend: only `city` and `region` (backend#221: optional, each at most 100 characters, "Enter at most 100 characters.").
14. (Revision 2) Agreement checkboxes, one per agreement backend#222 requires ("I agree to the Terms of Service" and "I agree to the Privacy Policy"), each linking to its page on openpb.org (frontend#201) in a new tab. Unchecked shows the backend's message on that box ("Accept the Terms of Service." / "Accept the Privacy Policy.") and nothing is sent. Sent as `accepted_terms: true` and `accepted_privacy: true` (backend#222 accepts only JSON `true`).
15. (Revision 2) Create account sends one signup request with every field. A server field error on email, password or confirm moves the player back to screen 1 with the message on its field and focus on it. Server errors on screen 2 fields show on their fields there. `signup_refused` shows in the alert on screen 2.
16. (Revision 2) Photon failures (network error, non-200, malformed JSON) show "We couldn't load suggestions. Try again." under the field and never block the rest of the form's errors. Photon is called only from the browser, not cached by the service worker (`src/pwa/` rules), and in `PUBLIC_API_MOCK` modes an MSW handler answers with made-up places.
17. (Revision 2) Fixes from the first review round: the "end of the birth month" mock test uses a fixed clock and covers the boundary (last day of the month at UTC-12, the day before, February of a leap year); the year field has no `maxlength`, so a pasted " 1990" still parses; `password_confirm` is required in `signupSchema`; the e2e same-session refusal waits for the second signup response before asserting.
18. (Revision 2) Copy and docs that describe signup as email and password only, or the age screen as out of scope, are updated (`plans/frontend-v1/proposal.md` "Out of v1", the mock store header).

## Files that change

- `app/src/lib/api/schema/allauth.json`, `app/src/lib/api/generated/allauth.d.ts`: regenerate with `pnpm api:pull:allauth` then `pnpm api:gen` (backend at 127.0.0.1:8000). The expected schema change is `BaseSignup` gaining `birth_year` and `birth_month` (integers, required) and `gender_division` from backend#215. Do not hand-edit.
- `app/src/lib/domain/schemas.ts`: add `birthMonthSchema` and `birthYearSchema`, and add `birth_month` and `birth_year` to `signupSchema`. Inputs are strings from the form; output integers (use `z.coerce` or a string-to-int pipe so `SignupInput` stays the form's string shape and the parsed data is numbers). Messages, matching the backend's where they overlap: missing month "Enter your birth month.", missing or non-numeric year "Enter your birth year.", year before 1900 "Enter a birth year of 1900 or later.", year after the current year "Enter a birth year that has passed." Domain tests in `schemas.test.ts`.
- `app/src/lib/features/auth/services.ts`: a `SignupDetails` type (`Credentials` plus `birth_year: number`, `birth_month: number`); `signup()` sends all four. `session.apply(state, email)` unchanged. Tests in `services.test.ts`.
- `app/src/lib/features/auth/components/signup-form.svelte`: a `FieldSet` with `FieldLegend` "Birth month and year" and a description "We only ask for the month and year." above Email, holding:
  - Birth month: a native `<select>` (platform first, app/AGENTS.md "Reuse before you build") with a blank "Month" placeholder option and the twelve month names, values 1 to 12, `autocomplete="bday-month"`, id `signup-birth_month`, name `birth_month`. Add shadcn-svelte's `native-select` with the CLI (`pnpm dlx shadcn-svelte@latest add native-select`) and restyle it to our tokens to match `Input`, rather than hand-styling a select. If the CLI output conflicts with existing files, restore them and say so in the PR.
  - Birth year: `TextField` with `inputmode="numeric"`, `autocomplete="bday-year"`, no `maxlength` (criterion 17: it cut a pasted " 1990"), placeholder "YYYY" is not used (labels carry meaning), id `signup-birth_year`, name `birth_year`.
  - Month and year sit side by side in a two-column grid inside the fieldset, on every width (they are short).
  - A gender `FieldSet` (legend "Gender") after the birth fieldset with the radio group (`Man` value `mens`, `Woman` value `womens`), id prefix `signup-gender_division`, and its error wired like the other fields.
  - `createAuthForm('signup', ['birth_month', 'birth_year', 'gender_division', 'email', 'password', 'password_confirm'])`. `password_confirm` is checked in `signupSchema` with a refine whose issue path is `password_confirm`, and is stripped from the data sent. `onError` shows fields when any of these has a message, else the form problem (unchanged logic, extended field list), so `signup_refused` lands in the alert.
  - The month field needs label, error and description wiring like `TextField` (`fieldA11y`). If a small `SelectField` component next to `text-field.svelte` is the least code, add it there.
  - As built: `select-field.svelte` next to `text-field.svelte`. The native-select CLI also bumped `@lucide/svelte` in `package.json` and the lockfile; that was reverted, since the installed version already has the chevron icon. Its unused `OptGroup` part was dropped, and its arbitrary `bg-[Canvas]` option classes removed (the browser draws the open list). `TextField`'s Show button now names its own field (`Show confirm password`), so the two buttons on signup have different names; the reset form's reads "Show new password".
  - The gender radios: the first item has the id `signup-gender_division` so focus can land there, the second `signup-gender_division-womens`. The radio group carries `aria-invalid` and `aria-describedby` for the error. It is marked required with Bits UI's `required` prop: an `aria-required` attribute passed by hand is overwritten by Bits (found in the live drive).
- `app/src/lib/features/auth/components/signup-form.svelte.test.ts`: update `fill` to set month and year; new tests below.
- `app/src/lib/mocks/handlers/allauth.ts` and, if needed, `app/src/lib/mocks/store.ts`: the signup handler requires `birth_year` and `birth_month` (allauth field errors with `param`, backend messages "Enter your birth year." / "Enter your birth month." / "Enter a whole number." / "Enter a month from 1 to 12." / "Enter a birth year of 1900 or later."), checks them before the email, and answers under 13 (end-of-month rule, like backend `apps/players/age.py`) with a 400 `{status: 400, errors: [{code: 'signup_refused', message: "We can't create an account with these details."}]}` and no `param`. The age is not stored in the mock store. Mock tests (`integration.test.ts` or the handler's tests) cover both. As built: the handler also requires `gender_division` with the backend's messages ("Choose a gender division.", "Choose one of the listed options."), since backend#215 shipped them, and keeps the backend's session flag (`signupRefused` in the store, a flag only) so a later sign-up in the same session is refused too.
- `app/e2e/auth.spec.ts`: every signup flow fills month and year. One new flow: an under-13 year shows the refusal alert and no "Check your email".
- `plans/signup-age-fields/plan.md`: this file; tick the steps.

## Order of work

0. Wait for backend#215 to merge, and run the backend from its `main`.
1. Regenerate the allauth schema and types; run `pnpm check` to see the typed call fail on the missing fields.
2. Domain schemas, TDD (`schemas.test.ts`).
3. Service, TDD (`services.test.ts`).
4. Mock handler, TDD.
5. Form component, TDD (`signup-form.svelte.test.ts`), including the native-select add.
6. e2e updates.
7. Full gate, then the live drive.

## Risks

- `z.coerce.number()` turns `''` into `0`, which would show the wrong message. Parse the string explicitly so an empty field says "Enter your birth year.".
- The `select` placeholder must not submit `0` or `''` as a month silently: an unselected month is a field error.
- Field names: the server returns `param: "birth_year"`, so the form's error keys and element ids must use `birth_year` and `birth_month`, or server errors will not reach the fields and focus will not move.
- The existing e2e flows and component tests fill only email and password; all of them break until updated.
- Do not add a client-side age check (criterion 4, ADR 0017 neutrality, and the 13 limit is the backend's rule).
- `check:build`: the native-select add must not import mocks.

## Proof

- Criterion 1: component test reads the form's field order (month and year before email) via DOM order.
- Criterion 2: services test asserts the request body `{ email, password, birth_year: 1990, birth_month: 6 }` with numbers.
- Criterion 3: component tests for empty month, empty year, a non-numeric year, 1899, and next year; each shows its message, marks `aria-invalid`, and `signup` is not called; focus lands on the month when both are empty. Schema tests cover the same values.
- Criterion 4: component test submits a recent year (current year minus 5) with a mocked `signup` and asserts `signup` is called (no client refusal). A test asserts the rendered form text does not contain "13".
- Criterion 5: component test with a server error `fields: { birth_year: ['Enter a birth year of 1900 or later.'] }` shows it on the year field.
- Criterion 6: component test with `code: 'signup_refused'`, `fields: {}` and the fixed message shows the alert with exactly that message.
- Criterion 9: component tests for no gender chosen (message, `signup` not called), a chosen gender sent as `mens`/`womens` (services test body), and a server `gender_division` error on the field. Live drive picks one.
- Criterion 10: schema test for a mismatch and a match; component test for a mismatch (message on the confirm field, `signup` not called); services test body has no `password_confirm`.
- Criterion 7: `pnpm check` passes; the schema diff is only `BaseSignup`.
- Criterion 8: mock handler tests and `pnpm e2e`.
- Live drive (High: changed path plus failure and edge paths), against `pnpm dev` with the real local backend (`PUBLIC_API_MOCK=off`): create an account with a 1990 birth date (made-up address at example.com) and reach "Check your email"; submit with an empty month; submit with a year under 13 and see the refusal; retry in the same session with an adult year and see the refusal again (backend session flag). Plus an a11y check of the fieldset.
- Measured on `main` (2026-11-23), "phrase absent": `grep -rn "13" app/src/lib/features/auth/components/signup-form.svelte` returns nothing, so the "does not contain 13" test starts true and stays a guard.

## Steps

- [x] Schema snapshot and types
- [x] Domain schemas
- [x] Service
- [x] Mock handler
- [x] Form (month, year, gender)
- [x] e2e
- [x] Gate and live drive

## Revision 2: files, order and risks

### Depends on (step 0)

- backend#221 (first name, last name, city, region at signup), backend#222 (agreement acceptance at signup), backend#223 (age check endpoint), frontend#201 (agreement pages on openpb.org). Run the backend from `main` with all three merged, then `pnpm api:pull:allauth`, `pnpm api:pull` and `pnpm api:gen`. Merged as backend PRs #233 (#221), #240 (#222), #226 (#223) and #234 (refusal flag gaps). The field and endpoint names in this plan are the merged ones.

### Files

- `app/src/lib/api/schema/*.json`, `app/src/lib/api/generated/*.d.ts`: regenerated, never hand-edited.
- `app/src/lib/domain/schemas.ts`: split `signupSchema` into `signupAccountSchema` (email, password, password_confirm, required) and `signupDetailsSchema` (birth fields, gender, names, location, agreements), plus `signupAgeSchema` (birth fields only). `signupSchema` stays as their merge for the final send. Location input is `{ city, region }` from a chosen suggestion, nothing when the field is empty, else a field error.
- `app/src/lib/features/auth/services.ts`: `checkSignupAge({ birth_year, birth_month })` calling `POST /_allauth/browser/v1/auth/signup/age-check` through the typed client, and `signup()` sending every field. `SignupDetails.gender_division` typed from the generated schema, not by hand.
- `app/src/lib/features/places/` (new feature): `photon.ts` with `searchPlaces(text, signal)` returning `{ city, region, country, label }[]` (fetch with `AbortController`, drops results without a city, de-duplicates labels) and its tests with a stubbed `fetch`. No other code calls Photon.
- `app/src/lib/features/auth/components/signup-form.svelte`: becomes the two-screen container with `step` state (`'account' | 'details'`), keeping all values in one form state. Screen parts may move to `signup-account-step.svelte` and `signup-details-step.svelte` if that keeps each file small. Focus moves to the screen's heading or first field on each step change.
- `app/src/lib/features/auth/components/location-field.svelte`: the combobox, debounce, abort of stale requests, error message and a11y wiring (`fieldA11y`).
- Checkboxes: add shadcn-svelte `checkbox` with the CLI and restyle to our tokens (reuse order), or a native `<input type="checkbox">` if that is less code; say which in the PR.
- `app/src/lib/mocks/handlers/allauth.ts` (signup takes and checks the new fields with the backend's messages), a new handler for `POST /_allauth/browser/v1/auth/signup/age-check` that shares `isOldEnough` and sets `signupRefused`, and a Photon handler with made-up places (`app/src/lib/mocks/handlers/photon.ts`).
- `app/src/pwa/` routing rules: Photon's origin is never cached (test in the existing routing rule tests).
- `app/src/lib/mocks/integration.test.ts`: the fixed-clock age tests (criterion 17).
- `app/e2e/helpers.ts` `fillSignup`, `app/e2e/auth.spec.ts`: two screens; new flows for the locked details until the age check passes, the refusal at the age check, a server email error sending the player back to screen 1, and a location chosen from mocked suggestions.
- `plans/frontend-v1/proposal.md`, `app/src/lib/mocks/store.ts` header: criterion 18.

### Order

0. Wait for the dependencies above.
1. Criterion 17 fixes first (they apply to the code as it is): each a frozen red test, then the fix.
2. Regenerate the schemas and types.
3. Domain schemas, TDD.
4. Services and `features/places/photon.ts`, TDD.
5. Mock handlers, TDD.
6. Components: two screens, age lock, names, location field, checkboxes, TDD.
7. PWA rule, e2e, docs.
8. Full gate, then the live drive.

### Risks

- The age lock is a convenience, not protection: the signup request is still checked by the backend. Do not treat the lock as the age rule (AGENTS.md hard rule 6).
- Photon receives what a player types. Never call it before the age check passes, never send it anything else (no email, no names), and never log the query.
- Stale Photon answers arriving out of order: abort the previous request and ignore any answer that is not for the current text.
- A Back from screen 2 must not clear screen 2 values, and a server error on screen 1 must not clear screen 2.
- A changed birth field after a pass must relock the rest; otherwise an unchecked age is sent (still refused by the backend, but the lock would lie).
- Photon's public instance has a fair-use limit; debounce and the 2-character minimum keep requests low. Hosting our own is out of scope.

### Proof (revision 2)

- Criterion 1: component tests for screen 1 checks (nothing sent), Continue to screen 2, Back keeping values.
- Criterion 11: component tests with a mocked `checkSignupAge`: rest disabled before, enabled after a pass, still disabled after `signup_refused` with the alert, relocked after Change. An e2e flow in mock mode.
- Criteria 12 to 14: schema and component tests for each message; services test body has every field.
- Criterion 13 and 16: `photon.test.ts` (query string, parsing, abort, failure), a component test that types and chooses a suggestion, a test that no Photon request goes out before the age passes, and the PWA rule test.
- Criterion 15: component test with a server `email` field error returns to screen 1 with focus on Email.
- Criterion 17: the frozen tests named there.
- Live drive against the real backend: happy path to "Check your email" with a location chosen from real Photon results; a second signup with City left empty, also to "Check your email"; under-13 at the age check (rest stays locked, then an adult year in the same session is still refused); an empty required field on each screen; Photon blocked in DevTools (request blocking) shows the suggestion error. a11y check of both screens, the combobox and the checkboxes. Delete created accounts after.

### Steps (revision 2)

- [x] Criterion 17 fixes
- [x] Gender labels "Man" and "Woman", missing message "Choose man or woman." (criterion 9, revision 2)
- [x] Dependencies merged, schemas and types regenerated
- [x] Domain schemas
- [x] Services and Photon search
- [x] Mock handlers
- [ ] Two screens, age lock, names, location, checkboxes
- [ ] PWA rule, e2e, docs
- [ ] Gate and live drive

## Decisions

- Gender ships in this PR, after backend#215 (project owner, 2026-11-23: "Backend first, one PR"). Required, with two choices, because it decides the men's, women's and mixed doubles formats and is needed for stats. The form says "Gender" with "Men" and "Women", the plain words players use, and sends the backend's `gender_division` values.
- Signup asks only for email, password, birth month and year, and gender (project owner, 2026-11-23). Names and city belong on the profile screen (backend#124). No day of birth and no phone number (ADR 0009).
- Confirm password is a client check only, a typo guard, not a security check. The backend's own `password2` signup field is not turned on, so no backend change is needed for it. Email verification already exists and stays as it is.
- Month is a select of month names, so nobody has to know that June is 6. Year is a numeric text field, not a 100-item select.
- Revision 2 (project owner, 2026-11-23): two screens, email and password first, then everything else, all sent in one request. Gender labels are "Man" and "Woman" (singular). Signup also asks for first name, last name and a location with suggestions, and agreement checkboxes. This replaces the earlier decision to leave names and city to the profile screen.
- Names, location and agreement acceptance wait for backend issues first (backend#221, backend#222), as gender did. The agreement pages are written by a person and published first (frontend#201); no checkbox links to a page that does not exist.
- Location suggestions come from Photon (OpenStreetMap), called from the browser: open source, no API key, no cost. Only city and region are kept (ADR 0009). backend#221 records Photon in the personal data inventory.
- City is optional at signup (project owner, 2026-11-24, backend#221).
- Age order (project owner, 2026-11-23): ADR 0009 and 0017 ask for the age first. The owner chose email and password first, with the age at the top of screen 2 and everything after it locked until the backend's age check (backend#223) passes, so a child never types a name or a location.
