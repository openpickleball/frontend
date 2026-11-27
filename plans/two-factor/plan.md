# Plan: Two-factor sign-in, enrollment, and reauthentication (issue #261)

**Status:** done

Risk tier: High. Auth is a forced High: this changes the sign-in flow, adds a session state, retries calls after reauthentication, and gates organizer authority on two-factor.

Domain skills: superpowers:test-driven-development, invoke. frontend-design, not applicable because the screens reuse the existing tokens, fields and shadcn-svelte components. No other framework, API or data skill is listed for this repo.

## Goal

A player can turn on two-factor authentication (TOTP from an authenticator app, plus recovery codes) in the app, sign in with it, and turn it off again. Calls that need a recent reauthentication ask for the password or a code, then retry. A 403 `mfa_required` explains what to do and links to the setting. Organizer members, whose authority needs two-factor (backend ADR 0043), are prompted to set it up. Every other player sees it as an optional setting with no organizer wording.

## Acceptance criteria

1. Sign-in: after a correct password for an account with TOTP, the login page asks for a 6-digit code from the authenticator app, with a switch to a recovery code. A correct code signs the player in and goes on to `next`, as a password-only sign-in does today. A wrong code shows an error on the code field and keeps the code step. A reload during the code step shows the code step again (the backend keeps the pending stage). "Start over" ends the pending stage (`DELETE auth/session`) and shows the password form.
2. Settings: a signed-in player opens Two-factor authentication from the profile page (`/profile/two-factor`). With TOTP off, the player sees a QR code drawn as inline SVG and the setup key as text, enters a code, and TOTP turns on. The new recovery codes are then shown once, with a way to copy them. With TOTP on, the player sees when it was turned on, can turn it off, can see how many recovery codes are unused, and can make new ones (shown once).
3. Reauthentication: turning TOTP on or off and making new recovery codes ask for a recent reauthentication whenever the backend answers 401 with a `reauthenticate` or `mfa_reauthenticate` flow, or an OPEN 403 `reauthentication_required`. The prompt offers the password when the flows include `reauthenticate`, a code when they include `mfa_reauthenticate` (TOTP or recovery code), and a switch when both are offered. After success the original call is sent once more. Cancel leaves everything as it was and shows no error.
4. A signed-in account can remove TOTP and make new recovery codes after reauthenticating (issue criterion 2).
5. `mfa_required`: any OPEN 403 with code `mfa_required` shows an explanation and a link to `/profile/two-factor`, not the generic "You can't do that" copy. For an account that has TOTP but whose session did not pass it, the explanation says to confirm with a code and offers the code prompt instead of the setup link. The `me/player` 403 mapping no longer reads `mfa_required` as an unverified email.
6. Organizer prompt: the app reads `GET /api/v1/organizer/organizers` once per signed-in session (after the session check and after sign-in) into the session store as `organizers` (the list) and `isOrganizer`. Both are cleared on sign out and on expiry. While loading, or after a failed call, the account is treated as a non-member. When `isOrganizer` is true and TOTP is off, the profile page and the two-factor page show a prompt that says organizer actions need two-factor. For a non-member, no organizer wording renders on either page.
7. Issue criterion 1, as reworded with the user (2026-11-26): an organizer member can set up TOTP in the app, and the session then passes two-factor, so an organizer operation (`GET /api/v1/organizer/events`) no longer answers 403 `mfa_required` and `POST /api/v1/organizer/events` is not refused for lack of two-factor. The app has no Event screens yet (#217), so this is shown with the mocks (e2e) and with the live drive against the real backend. Creating an Event in the app is #217's to test.
8. The service worker caches no MFA or reauthentication response. `/_allauth/` and `/api/` are already network-only, and a test pins every path this change calls to those prefixes.
9. Mock handlers for every new call, and tests at each layer (services in node with MSW, components in browser mode, e2e on the mocks).

## Files that change

Paths are under `app/` unless stated.

- `package.json`, `pnpm-lock.yaml`: add `uqr` (MIT, no dependencies) as a dependency.
- `src/lib/api/errors.ts`: a specific message for Ninja 403 `mfa_required` and `reauthentication_required` (keep `kind: 'forbidden'`, keep `code`). Export a helper `reauthFlowsOf(error: AppError): ReauthMethod[] | null` that reads allauth 401 `flows` (`reauthenticate` means password, `mfa_reauthenticate` means code) and treats OPEN 403 `reauthentication_required` as both methods. Optional `types` for the code flow.
- `src/lib/api/client.ts`: an `onMfaRequired(listener)` hook, an `open.use` middleware like `onUnauthenticated`, fired on OPEN 403 with code `mfa_required`. Read the body from a clone.
- `src/lib/features/auth/session.svelte.ts`: a new status `pending_mfa` with the offered `types` (`totp`, `recovery_codes`). Add `organizers` (`OrganizerMembership[] | null`, null while unknown or loading), `isOrganizer` (getter), and `mfaEnrolled` (`boolean | null`). `apply` clears them on any state other than `signed_in`.
- `src/lib/features/auth/services.ts`: `stateOf` returns `pending_mfa` for a 401 with a pending `mfa_authenticate` flow. `login` resolves to it. New `authenticateMfa(code)` (`POST auth/2fa/authenticate`), `cancelMfa()` (`DELETE auth/session`, then signed_out), `reauthenticate(password)` (`POST auth/reauthenticate`), `reauthenticateMfa(code)` (`POST auth/2fa/reauthenticate`). After any change to `signed_in`, call `loadAccountState()`: `GET organizer/organizers` and `GET account/authenticators` in parallel. Each failure leaves its value as the safe default (`organizers = []`, `mfaEnrolled = null`) and does not throw.
- `src/lib/features/auth/two-factor.ts` (new): `getTotpSetup()` (`GET account/authenticators/totp`: 404 gives `{secret, totp_url}`, 200 means already on), `activateTotp(code)`, `deactivateTotp()`, `getRecoveryCodes()`, `regenerateRecoveryCodes()`, `listAuthenticators()`. Each throws an `AppError`, and updates `session.mfaEnrolled` on success. The regenerate 200 is untyped in the spec, so parse it with a small zod schema of the RecoveryCodes shape.
- `src/lib/features/auth/reauth.svelte.ts` (new): a single prompt store. `requestReauth(methods): Promise<boolean>` opens the prompt and resolves true after a successful reauthentication, false on cancel. `withReauth(call)` runs `call`. If it throws an error that `reauthFlowsOf` matches, it asks with `requestReauth`, and on true runs `call` once more; a second reauth error becomes an `AppError` that says "We couldn't confirm it's you. Try again." (review finding O). A call that joins an open prompt adds its methods to it. On false it throws a `ReauthCancelled` error that callers ignore.
- `src/lib/features/auth/components/mfa-code-form.svelte` (new): the sign-in code step. A TextField with `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength` 7 for TOTP (6 digits plus the one space apps show, which `parseMfaCode` drops; review finding B). A recovery-code mode with a text field (`autocomplete="off"`). It uses `createAuthForm`, a "Use a recovery code" or "Use your authenticator app" switch, and "Start over".
- `src/lib/features/auth/components/mfa-code-field.svelte` (new): the code field both code steps share (sign-in and the reauthentication prompt), so the TOTP and recovery code attributes live in one place. `parseMfaCode` in `forms.ts` checks the code before it is sent.
- `src/lib/features/auth/components/login-form.svelte`: when `session.status === 'pending_mfa'`, render `MfaCodeForm` in place of the password fields. On success, `onsuccess` as today.
- `src/lib/features/auth/components/reauth-prompt.svelte` (new): mounted once in `src/routes/+layout.svelte`. A dialog with a password field or a code field (with a recovery code switch when offered), Confirm and Cancel. It uses shadcn-svelte `dialog`, added with `pnpm dlx shadcn-svelte@latest add dialog` into `src/lib/ui/dialog/` and restyled to the tokens in the same commit like `alert-dialog` (bottom sheet below `md`, centered at `md`). The field is focused on open.
- Done as a listener in the root layout, on `watchMfaRequired(notify)` in `services.ts` (node tested), with the toast copy in the layout: subscribe to `api.onMfaRequired`. Show one `toast` (svelte-sonner, deduplicated by id) with the explanation. When `session.mfaEnrolled` is true, the action is "Enter a code", which opens the reauth prompt with the code method. Otherwise the action is "Set up two-factor", which goes to `/profile/two-factor`.
- `src/lib/features/auth/components/two-factor-settings.svelte` (new), `qr-code.svelte` (new, `uqr`'s `encode` drawn as one `<path>` in an `<svg>` with a `viewBox`, `role="img"` and an `aria-label`, no `style` attributes), `recovery-codes.svelte` (new: a list in a monospace font, a Copy button that uses `navigator.clipboard.writeText`, and a note that they are shown once), `organizer-mfa-prompt.svelte` (new, renders only when `session.isOrganizer && session.mfaEnrolled === false`).
- `src/lib/features/auth/index.ts`: export the new public pieces.
- `src/lib/domain/routes.ts`: `twoFactor: '/profile/two-factor'`.
- `src/routes/profile/two-factor/+page.svelte` (new): page title, `OrganizerMfaPrompt`, `TwoFactorSettings`. It is guarded already, since `/profile/*` is guarded.
- `src/lib/features/auth/components/two-factor-status.svelte` (new): the profile page's section, so it can be tested on its own.
- `src/routes/profile/+page.svelte`: a "Two-factor authentication" section in the existing section pattern (`border-t border-line pt-6`, `h2.label`) with the on or off status, a link to the page, and `OrganizerMfaPrompt` above it.
- `src/routes/+layout.svelte`: mount `ReauthPrompt` and the `mfa_required` listener.
- `src/lib/features/players/my-code.svelte.ts`: a 403 with code `mfa_required` is not 'unverified'. It gets its own status, `mfa-required`, and `OwnCodeGate` (so every code gate) shows the two-factor explanation, not a connection problem (review finding G). When `session.mfaEnrolled` is true it offers "Enter a code" (the code prompt, then my code is read again); when it is unknown it reads it again first with `checkMfaEnrolled`; otherwise it links to `/profile/two-factor` (review finding T1).
- Review finding G, the other screens: the match page's action errors (`features/matches/action-problem.ts`), a correction in the record form and the offline queue show `MFA_REQUIRED_MESSAGE` for a 403 `mfa_required`. The queue keeps such a match waiting (`reason: 'mfa'`, with "Send now") instead of marking it refused.
- `src/lib/features/auth/guard.ts`: no change needed. `pending_mfa` is not `isSignedIn`, so guarded pages already send to login (which shows the code step) and the login page stays reachable. `services.test.ts` pins both.
- Mocks, `src/lib/mocks/`:
  - `store.ts`: an account gains `totp?: { secret: string; createdAt: number }`, `recoveryCodes?: { codes: string[]; used: string[]; createdAt: number; viewed: boolean }` (times in seconds since the epoch, as allauth sends them), `organizers?: OrganizerMembership[]`, and `mfaRequired?: boolean` (stands in for staff or moderator). The session gains `stage: 'mfa' | null`, `mfaAt`, `reauthAt`. `login` returns `'mfa'` for an account with TOTP. The mock accepts `MOCK_TOTP_CODE` (`'123456'`) as the current TOTP code and each unused fixture recovery code once. Reauthentication is recent for 300 seconds of `Date.now()`.
  - `browser.ts`: bump the storage key to `open-mock-state-v2`, so old saved state is dropped rather than failing the shape check.
  - `fixtures.ts`: made-up accounts `organizer@example.com` (member of a made-up verified organizer, no TOTP), `twofactor@example.com` (TOTP on, recovery codes `MOCK_RECOVERY_CODES`), `moderator@example.com` (`mfaRequired`, no TOTP). Same `MOCK_PASSWORD`. Made-up organizer names and codes only.
  - `handlers/allauth.ts` and `responses.ts`: `config` gains `mfa: { supported_types: ['totp', 'recovery_codes'] }`. A 401 with a pending `mfa_authenticate` flow (`types: ['totp', 'recovery_codes']`) for a session at the MFA stage, from login and session GET. `auth/2fa/authenticate`, `auth/reauthenticate`, `auth/2fa/reauthenticate`, `account/authenticators`, `account/authenticators/totp` (GET, POST, DELETE), `account/authenticators/recovery-codes` (GET, POST), with the backend's order: reauthentication first, then input. `authenticated()` lists an `mfa` method when the session passed it.
  - `handlers/open.ts`: `GET organizer/organizers`. A first handler on `/api/v1/*` that answers 403 `mfa_required` for a signed-in account with `mfaRequired` and no TOTP, or with TOTP and a session that did not pass it, and otherwise falls through. `GET organizer/events` (an empty list) and `POST organizer/events` (403 for a member without TOTP, 201 with a made-up Event otherwise), only so e2e can show criterion 7.
  - `schema-drift.test.ts`: pin any new constant that mirrors `open.json`.
- Added by the review fixes (2026-11-26 and 27), in brief:
  - `requestReauth(methods, codeTypes)`: the prompt request carries the kinds of code (`reauthCodeTypesOf` reads the flow's `types`), keeps an `id`, and merges what a joining call adds.
  - `reauthPrompt.password` and `reauthPrompt.code` live in the prompt store, and every settle clears them.
  - `session.onLeaveSignedIn(listener)`: the prompt settles false and closes when the account stops being signed in.
  - `session.mfaRevision`: counts writes to `mfaEnrolled`, so an older account read does not overwrite a newer value. Only the newest read writes `organizers`.
  - `session.mfaTimedOut` and the login form's "That took too long. Sign in again." alert, cleared when a new sign-in starts.
  - `loadAccountState` runs again after `reauthenticateMfa` and `activateTotp` succeed. `getTotpSetup` updates `mfaEnrolled`. `checkMfaEnrolled` re-reads it for the `mfa_required` notice and the code gate.
  - The offline queue's `mfa` outcome and wait reason. `features/matches/action-problem.ts` holds the match page's action copy. My code's `mfa-required` status, shown by `OwnCodeGate`.
- Tests: `services.test.ts` and `two-factor.test.ts` (node, MSW), `reauth.test.ts` (node), `errors.test.ts`, `client.test.ts` (the `onMfaRequired` middleware), component tests `mfa-code-form.svelte.test.ts`, `login-form.svelte.test.ts` (code step), `reauth-prompt.svelte.test.ts`, `two-factor-settings.svelte.test.ts`, `organizer-mfa-prompt.svelte.test.ts`, profile page test (`src/routes/profile/organizer-wording.test.ts`, a server render of both pages), `src/pwa/routing.test.ts` (criterion 8), and `e2e/two-factor.spec.ts`.
- `README.md` (app): the new mock accounts and `MOCK_TOTP_CODE`, next to the existing fixture account notes, if the README lists them.
- `../plans/frontend-v1-2/plan.md`: note that backend#301 (membership) and backend#99 (MFA) shipped and that #261 reads the memberships #217 will reuse.

## Order of work

Each step is TDD (a failing test first, then the code) and its own commit, signed off.

1. [x] Add `uqr` and the shadcn-svelte `dialog`, restyled. No behavior yet. Gate: `pnpm check`, `pnpm lint`.
2. [x] Errors and client: `mfa_required` and `reauthentication_required` messages, `reauthFlowsOf`, `onMfaRequired` middleware. Fix the `my-code` 403 mapping.
3. [x] Mocks: store fields, fixtures, allauth MFA handlers, organizer handlers, `mfa_required` gate, storage key bump. Unit tests on the mock store's rules (reauthentication first, code once).
4. [x] Session and services: `pending_mfa`, `authenticateMfa`, `cancelMfa`, reauthentication calls, `loadAccountState`, clearing on sign out and expiry. Guard rules for `pending_mfa`.
5. [x] Sign-in code step: `MfaCodeForm` and the login form switch.
6. [x] Reauthentication: `reauth.svelte.ts`, `ReauthPrompt`, mounted in the root layout.
7. [x] Two-factor services and settings: `two-factor.ts`, `QrCode`, `RecoveryCodes`, `TwoFactorSettings`, the `/profile/two-factor` route, the profile section.
8. [x] Organizer prompt and the `mfa_required` toast.
9. [x] E2E spec and the service worker routing test. Full gate. Live drive.

## Risks

- **Riskiest step: 4.** `stateOf` decides who is signed in. Getting `pending_mfa` wrong could treat a half-signed-in session as signed in (the guard lets the player in, and every API call fails), or loop between login and a guarded page. Tests cover each 401 flow shape and the guard both ways.
- The TOTP code is sent again after a reauthentication. The backend checks reauthentication before it reads the code, so the first try never uses the code. If the 30-second window passes during the prompt, the retry gets 400 and the player types a new code. That is acceptable, and the error shows on the code field.
- A password reauthentication does not satisfy a session that never passed two-factor: the backend then offers only `mfa_reauthenticate`. The prompt reads the flows it gets each time, rather than assuming password.
- Reading the recovery codes needs a recent reauthentication too (allauth's `view_recovery_codes`), so the read after turning TOTP on runs through `withReauth`, the page is always read again after a successful activation, and a failed read shows TOTP on with a message that offers "Make new recovery codes" (review finding A). The mock asks for the same reauthentication.
- Recovery codes are shown once (`MFA_RECOVERY_CODES_SHOW_ONCE`). After that, `GET recovery-codes` returns an empty `unused_codes`. The settings show the unused count and offer new codes, and never promise to show the old ones again.
- Removing TOTP ends the account's other sessions (ADR 0047). Say so in the confirm text.
- An account with TOTP cannot add an email address. Not in scope: the app has no email change screen.
- CSP: the QR code is an inline SVG with no `style` attributes, so no CSP change. Every e2e test fails on a violation, so this is checked.
- The membership call adds a request after every sign-in. It is not awaited by the sign-in redirect.
- The mock storage key bump drops saved mock state once. Only dev and tests use it.
- Rule 6 (`AGENTS.md`): the organizer prompt and `isOrganizer` are display only. The backend enforces two-factor for organizer authority.

What this does not do: passkeys (#117), "trust this browser", the organizer area and Event screens (#217), account deletion (#265), and the sessions list (#262). The reauthentication helper is written so #265 can use it on `DELETE accounts/me`.

## Proof

| Criterion | Test |
| --- | --- |
| 1 | `services.test.ts` (login to `pending_mfa`, `authenticateMfa` ok and wrong, reload reads `pending_mfa`, `cancelMfa`), `mfa-code-form.svelte.test.ts`, `login-form.svelte.test.ts`, `services.test.ts` ("keeps guarded pages closed at the code step", `redirectFor` both ways; `guard.ts` and `guard.test.ts` do not change), e2e "signs in with a code" and "signs in with a recovery code" |
| 2 | `two-factor.test.ts`, `two-factor-settings.svelte.test.ts` (QR svg present, key text, codes shown once), e2e "turns two-factor on" |
| 3 | `reauth.test.ts` (retry once, cancel, second failure thrown, both error shapes), `reauth-prompt.svelte.test.ts` (password, code, switch) |
| 4 | e2e "turns two-factor off" and "makes new recovery codes", each through the prompt |
| 5 | `errors.test.ts`, `client.test.ts`, `my-code` test, e2e "mfa_required shows the setup link" with `moderator@example.com` |
| 6 | `services.test.ts` (memberships loaded, cleared, failure is non-member), `organizer-mfa-prompt.svelte.test.ts`, profile page test (`src/routes/profile/organizer-wording.test.ts`, a server render of both pages), e2e: no organizer wording for `player@example.com` |
| 7 | e2e: `organizer@example.com` enrolls, then `POST /api/v1/organizer/events` from the page answers 201 (mocks); live drive against the real backend |
| 8 | `src/pwa/routing.test.ts`: every new path is network-only |
| 9 | the above |

Live drive (High tier): run `pnpm dev:stack` (real backend, seeded) and `pnpm dev` with `PUBLIC_API_MOCK=missing`. Drive the changed path: sign up or use a seeded verified account, turn TOTP on through the reauthentication prompt (compute codes from the shown secret with a small script, for example `python3 -c` with `hmac`), sign out, sign in with a code, sign in with a recovery code, make new codes, turn TOTP off. Also the failure and edge paths: a wrong code at sign-in, a wrong password in the prompt, Cancel in the prompt, a reload at the code step, "Start over". For criterion 7, give a seeded account a membership in a verified organizer in the backend shell, and show `GET /api/v1/organizer/events` answering 403 `mfa_required` from a password-only session after enrolling elsewhere, then 200 after the code prompt. If the backend cannot run, say so and record the mocks-only evidence.

Live drive results (2026-11-26 and 2026-11-27). The real backend ran on port 8001 with `FIELD_ENCRYPTION_KEYS` set. The shared one on 8000 had no key, and turning on TOTP got a 500 there. The app ran with `PUBLIC_API_MOCK=missing`, and Playwright computed the TOTP codes. No CSP violations. What passed:

- **Turning on:** TOTP turned on through the password prompt. A wrong password and Cancel behaved as planned. The codes were shown once.
- **Sign-in:** with a code and with a recovery code. A wrong code, a reload at the code step, Start over and an expired code step behaved as planned.
- **Codes and turning off:** new codes and turning off worked.
- **Criterion 7:**
  - A member got 403 on `POST organizer/events` before enrolling, and 201 after.
  - A password-only session got 403 `mfa_required` on `GET organizer/events` after enrolling elsewhere, and 200 after the code prompt.
- **Fix rounds:** each was driven for the paths it changed (A, C, F, G for my-code, L, T1, T2). D, the other G screens, T3, T4, T5, U1 and U2 are shown by their tests only.

The full gate passed after every round. Its last run, on `2b548d8`: 1932 unit tests and 140 e2e tests.

Measured on `origin/main` (`5761030`, 2026-11-26) for the phrase-absent test "no organizer wording for a non-member": `grep -n -i organizer app/src/routes/profile/+page.svelte app/src/lib/features/players/*.svelte` prints nothing, so the profile page has no organizer wording today. The test may check the whole profile page and the whole two-factor page for the word "organizer" (case-insensitive) when signed in as `player@example.com`.

Rewritten frozen test, `app/src/lib/features/players/own-code-gate-mfa-code.svelte.test.ts` (2026-11-27). Each run copied only that file into a scratch worktree and ran `pnpm exec vitest run --project browser src/lib/features/players/own-code-gate-mfa-code.svelte.test.ts`:

- At `0aec873` (the red commit, before the T1 fix): all 3 cases fail. "offers the code prompt" fails on `TimeoutError: locator.click` (no "Enter a code" button). The other two fail on `TypeError: Cannot read properties of undefined (reading 'mockImplementation')` and `(reading 'mockReset')`, because `checkMfaEnrolled` is not exported yet.
- At `0aec873` plus only the `checkMfaEnrolled` export (`auth/services.ts`, `auth/index.ts`), without the gate change: "reads two-factor again when it is unknown" fails on `VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Enter a code' })`. The gate never reads two-factor again and keeps the setup link. "offers the code prompt" fails on `TimeoutError: locator.click`. "keeps the setup link" passes. So the rewritten case catches the defect itself.
- At `git merge-base origin/main HEAD` (`5761030`): all 3 fail on missing pieces. `TypeError: Cannot read properties of undefined (reading 'mockImplementation')` and `(reading 'settle')` (no `checkMfaEnrolled` or `reauthPrompt` on main), `TimeoutError: locator.click`, and `Cannot find element with locator: getByRole('link', { name: 'Set up two-factor' })` (main has no `mfa-required` status).

## Decisions

- 2026-11-26, with the user: #261 reads the organizer memberships itself (`list_my_organizers`), following #217's "Only for organizers" rules, rather than waiting for #217. Issue criterion 1 is reworded to criterion 7 above, since Event screens are #217.
- 2026-11-26, with the user: the QR code uses `uqr` drawn as inline SVG, so the CSP does not change.
- Settings live at `/profile/two-factor`, not under `/account`, because `/account/*` is the signed-out area (bare shell, not a `next` target).
- A global toast handles `mfa_required`, so every screen gets the explanation and link without its own mapping.
- 2026-11-26, live drive: allauth leaves `unused_codes` out of the recovery codes body once the codes were shown (it does not send an empty list). `getRecoveryCodes` now reads a missing list as no codes, pinned by `two-factor-shown-once.test.ts`, and the mock answers the same way.
- 2026-11-26, live drive review: the `mfa_required` notice read `session.mfaEnrolled` before the authenticator list had loaded after a sign-in, so an account with two-factor could be told to set it up. It now waits for the account state read in flight, pinned by `mfa-required-race.test.ts`.
- 2026-11-26, live drive: the backend's `GET account/authenticators/totp` makes a new setup key on every call, and the backend refuses a TOTP code that was already used in its 30-second window. The app reads the setup key once per visit to the page. The mock keeps one fixed key and accepts `MOCK_TOTP_CODE` every time, so neither rule is mocked.
- 2026-11-27, with the user: the frozen test `own-code-gate-mfa-code.svelte.test.ts` was rewritten by one line (`session.mfaEnrolled = null;` first in "reads two-factor again when it is unknown"). The first case set `mfaEnrolled` to true, and nothing reset the session between cases, so the "unknown" case started with two-factor already on and could not pass against a correct gate. The proof is under Proof.
- 2026-11-27, review fixes: everything the fixes added is listed under "Files that change". The reasons are in their commits and frozen tests (findings A to R and T1 to T5).
