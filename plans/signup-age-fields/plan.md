# Plan: Ask for birth month and year, gender, and a confirmed password at signup (issue #197)

**Status:** active

Risk tier: High. Forced: the change touches authentication (the signup request and its error handling). It also changes an API contract and stateful form behavior.

Domain skills: django-allauth: not applicable to code here (the backend contract is already shipped and read from backend `apps/accounts/headless_views.py`, `apps/accounts/forms.py`, ADR 0017). frontend-design, impeccable: not applicable, the form reuses existing field components and tokens. chrome-devtools-mcp:a11y-debugging: invoke during the live drive to check the new fieldset's labels, descriptions and focus. Other listed skills (Django, Celery, Expo, React): not applicable, this is a SvelteKit app change.

## Goal

A player can create an account against the real backend. Signup has been broken since backend#114 made `birth_year` and `birth_month` required on `POST /_allauth/{client}/v1/auth/signup`.

## Acceptance criteria

1. The signup form asks for birth month and birth year, above the email field (ADR 0017: "on the first screen, before the email address").
2. The signup request body carries `birth_year` and `birth_month` as integers and `gender_division`, next to `email` and `password`.
3. Before sending, the client checks the month (one of 1 to 12) and the year (a whole number, 1900 or later, not after the current year). A missing or invalid value shows a message on that field, focus moves to the first field in error (in page order: month, year, gender, email, password), and nothing is sent.
4. The client never checks the minimum age and no copy names it. The backend decides.
5. The backend's `birth_year` and `birth_month` field errors show on their fields, like the email and password errors do today.
6. The under-13 answer (400, code `signup_refused`, no `param`, message "We can't create an account with these details.") shows that message as the form-level alert and nothing more.
7. The allauth schema snapshot (`app/src/lib/api/schema/allauth.json`) and generated types match the running backend, and the typed call compiles with the new fields.
8. The MSW signup handler requires both fields with the backend's messages, and refuses an under-13 age with the same `signup_refused` answer. Mock mode e2e signup flows fill the new fields.
9. The form asks for gender as a required choice of "Men" or "Women" (a radio group, `#lib/ui/radio-group`), sent as `gender_division` `mens` or `womens`. Nothing chosen shows "Choose men or women." on the field, and nothing is sent. The backend's `gender_division` field error shows on the field. This criterion depends on backend#215 shipping; the request shape follows that PR's schema.
10. A "Confirm password" field follows Password. The client checks that the two match before sending ("The passwords don't match." on the confirm field) and sends only `password`. It has its own Show button, like Password. The email verification step (Check your email, then the emailed link) is unchanged.

## Files that change

- `app/src/lib/api/schema/allauth.json`, `app/src/lib/api/generated/allauth.d.ts`: regenerate with `pnpm api:pull:allauth` then `pnpm api:gen` (backend at 127.0.0.1:8000). The expected schema change is `BaseSignup` gaining `birth_year` and `birth_month` (integers, required) and `gender_division` from backend#215. Do not hand-edit.
- `app/src/lib/domain/schemas.ts`: add `birthMonthSchema` and `birthYearSchema`, and add `birth_month` and `birth_year` to `signupSchema`. Inputs are strings from the form; output integers (use `z.coerce` or a string-to-int pipe so `SignupInput` stays the form's string shape and the parsed data is numbers). Messages, matching the backend's where they overlap: missing month "Enter your birth month.", missing or non-numeric year "Enter your birth year.", year before 1900 "Enter a birth year of 1900 or later.", year after the current year "Enter a birth year that has passed." Domain tests in `schemas.test.ts`.
- `app/src/lib/features/auth/services.ts`: a `SignupDetails` type (`Credentials` plus `birth_year: number`, `birth_month: number`); `signup()` sends all four. `session.apply(state, email)` unchanged. Tests in `services.test.ts`.
- `app/src/lib/features/auth/components/signup-form.svelte`: a `FieldSet` with `FieldLegend` "Birth month and year" and a description "We only ask for the month and year." above Email, holding:
  - Birth month: a native `<select>` (platform first, app/AGENTS.md "Reuse before you build") with a blank "Month" placeholder option and the twelve month names, values 1 to 12, `autocomplete="bday-month"`, id `signup-birth_month`, name `birth_month`. Add shadcn-svelte's `native-select` with the CLI (`pnpm dlx shadcn-svelte@latest add native-select`) and restyle it to our tokens to match `Input`, rather than hand-styling a select. If the CLI output conflicts with existing files, restore them and say so in the PR.
  - Birth year: `TextField` with `inputmode="numeric"`, `autocomplete="bday-year"`, `maxlength="4"`, placeholder "YYYY" is not used (labels carry meaning), id `signup-birth_year`, name `birth_year`.
  - Month and year sit side by side in a two-column grid inside the fieldset, on every width (they are short).
  - A gender `FieldSet` (legend "Gender") after the birth fieldset with the radio group (`Men` value `mens`, `Women` value `womens`), id prefix `signup-gender_division`, and its error wired like the other fields.
  - `createAuthForm('signup', ['birth_month', 'birth_year', 'gender_division', 'email', 'password', 'password_confirm'])`. `password_confirm` is checked in `signupSchema` with a refine whose issue path is `password_confirm`, and is stripped from the data sent. `onError` shows fields when any of these has a message, else the form problem (unchanged logic, extended field list), so `signup_refused` lands in the alert.
  - The month field needs label, error and description wiring like `TextField` (`fieldA11y`). If a small `SelectField` component next to `text-field.svelte` is the least code, add it there.
  - As built: `select-field.svelte` next to `text-field.svelte`. The native-select CLI also bumped `@lucide/svelte` in `package.json` and the lockfile; that was reverted, since the installed version already has the chevron icon. Its unused `OptGroup` part was dropped, and its arbitrary `bg-[Canvas]` option classes removed (the browser draws the open list). `TextField`'s Show button now names its own field (`Show confirm password`), so the two buttons on signup have different names; the reset form's reads "Show new password".
  - The gender radios: the first item has the id `signup-gender_division` so focus can land there, the second `signup-gender_division-womens`. The radio group carries `aria-invalid` and `aria-describedby` for the error.
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
- [ ] Gate and live drive

## Decisions

- Gender ships in this PR, after backend#215 (project owner, 2026-11-23: "Backend first, one PR"). Required, with two choices, because it decides the men's, women's and mixed doubles formats and is needed for stats. The form says "Gender" with "Men" and "Women", the plain words players use, and sends the backend's `gender_division` values.
- Signup asks only for email, password, birth month and year, and gender (project owner, 2026-11-23). Names and city belong on the profile screen (backend#124). No day of birth and no phone number (ADR 0009).
- Confirm password is a client check only, a typo guard, not a security check. The backend's own `password2` signup field is not turned on, so no backend change is needed for it. Email verification already exists and stays as it is.
- Month is a select of month names, so nobody has to know that June is 6. Year is a numeric text field, not a 100-item select.
