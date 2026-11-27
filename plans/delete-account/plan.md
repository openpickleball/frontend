# Plan: Let players delete their account from the profile (issue #265)

**Status:** active

Risk tier: High. Forced: it sends a destructive, irreversible request that needs reauthentication, and it ends the session and deletes data kept on the device.

Domain skills: superpowers:test-driven-development (invoke). superpowers:verification-before-completion (invoke). frontend-design and impeccable: not applicable because the dialog reuses the existing design system (AlertDialog, TextField, Alert, Button) and adds no new visual direction. No Svelte, auth or API skill is listed; the backend skills (django, django-allauth, django-ninja-api) are not applicable because the backend endpoint exists (backend#116) and is not changed here.

## Goal

A player can delete their account from the profile. The app explains what goes and what stays, makes the player confirm on purpose, handles reauthentication and the refusals, and leaves nothing of the account on the device afterwards.

## Acceptance criteria

1. The profile's "Your data" section has a second row, "Delete your account", after "Copy of your data". It is a button that opens a dialog. The h2 order of the profile page is unchanged.
2. The dialog says, before the player confirms:
   - What goes: email address, password, names, birth month and year, gender division, city and region, privacy settings, sign-in sessions, two-factor methods and organizer memberships.
   - What stays: match results, so other players' ratings don't change. In those matches the player shows as "Private player", and their player keeps its OPEN Code.
   - It can't be undone, and the same email address can sign up again later as a new player who starts fresh.
   - When the offline queue holds unsent matches for this account, that deleting the account also deletes them from this device.
3. The delete button (`destructive-solid`, label "Delete account") does nothing until the player has typed the word `delete` (trimmed, any case) into a labelled field. Until then the button is disabled.
4. Confirming sends `DELETE /api/v1/accounts/me` through `withReauth`:
   - 403 `reauthentication_required` opens the existing "Confirm it's you" prompt (password, or a code when the account has two-factor), then sends the delete again. Cancel in the prompt leaves the dialog open with no error.
   - 403 `mfa_required`: the dialog says the account must set up two-factor first and links to `/profile/two-factor`.
   - 409: the dialog says a staff account can't be deleted here and to email info@openpb.org (a `mailto:` link).
   - 429: the dialog shows the shared throttled message ("Too many attempts. Wait a moment and try again.").
   - Any other error: the dialog shows the error's app message.
   - While the request runs, the button shows a spinner and `aria-busy`, and the dialog cannot be closed.
5. On 204, in this order, before any other request can run: every `onSignOut` listener runs with the account's email (so the root layout resets the code and Needs you, and `offlineQueue.forget()` deletes this account's queue), the session becomes signed out, and a new `session.accountDeleted` flag is set. The match cache resets through the existing account-change effect. A later OPEN 401 does not set `session.expired`.
6. The app then goes to `/account/login`, which shows "Your account was deleted." with a one-line description, and does not show "You were signed out.". A later `session.apply` (for example the next sign-in) clears the flag.
7. Mocks: `DELETE /api/v1/accounts/me` answers 204 (and removes the account and its session from the mock store, so the same email can sign up again), 403 `reauthentication_required` without a reauthentication in the last 300 seconds, 403 `mfa_required` (existing catch-all), 409 `conflict` for a new staff fixture account, and 429 `throttled` past a per-session attempt limit.
8. Tests cover criteria 1 to 7, and an e2e test drives the happy path: sign in, open the dialog, type the word, confirm with the password in the prompt, land on the sign-in page with the notice, and fail to sign in again with the old password.
9. No copy promises anything the backend or the Privacy Policy does not say.

## Files that change

- `app/src/lib/features/auth/services.ts`: `deleteAccount({ api })` sends the DELETE and throws `toAppError` on a non-2xx. `endDeletedAccount()` runs the sign-out listeners, applies `signed_out` and sets `accountDeleted`. Extract the listener loop from `logout()` into one private `runSignOutListeners(email)` used by both. `deleteAccount` calls `endDeletedAccount()` itself on 204 (see Decisions). `setUnsentMatchesSource(source)` and `unsentMatches()`, the same pattern as `setSignOutWarning`, give the dialog the unsent count.
- `app/src/lib/features/auth/session.svelte.ts`: `accountDeleted` flag, cleared by `apply()` and `reset()`, set by a new `markDeleted()` after the signed-out apply (the same shape as `expire()`).
- `app/src/lib/features/auth/components/delete-account-dialog.svelte` (new): the AlertDialog, its trigger row content, copy, the typed-word field, the error alerts, and the busy hold (follow `features/organizer/components/delete-event-dialog.svelte`).
- `app/src/lib/features/auth/index.ts`: export the dialog and the services.
- `app/src/lib/features/auth/components/login-form.svelte`: the "Your account was deleted." alert (not destructive), shown when `session.accountDeleted`.
- `app/src/routes/+layout.svelte`: `setUnsentMatchesSource(() => offlineQueue.unsent)` next to the sign-out warning.
- `app/src/routes/profile/+page.svelte`: the new row in "Your data", rendered like the Send feedback button row.
- `app/src/lib/mocks/handlers/open.ts`, `app/src/lib/mocks/store.ts`, `app/src/lib/mocks/responses.ts`, `app/src/lib/mocks/fixtures.ts`: the DELETE handler, `deleteAccount` and attempt counting in the store, `reauthenticationRequiredOpen()` and `throttled()` helpers, a `staff@example.com` fixture with `staff: true` (and `MockAccount.staff?`). Bump the mock state storage key only if the stored shape changes incompatibly.
- Tests (new or extended): `services` delete tests against the mocks, `session` flag tests, `delete-account-dialog.svelte.test.ts`, login form test, `routes/profile/profile-page.test.ts`, mock handler tests, `e2e/delete-account.spec.ts`.
- `plans/delete-account/plan.md`: tick steps and record decisions.

## Order of work

1. Mock store and handler, with handler tests (TDD: red first).
2. `session.accountDeleted` and `endDeletedAccount()`, with tests that the listeners run before signed out, the flag is set, and a 401 after it does not expire the session.
3. `deleteAccount()` service tests against the mocks for each status.
4. Login form notice and its test.
5. The dialog and its component tests (typed word, reauth retry, cancel, each refusal, busy hold, unsent-matches warning, success goes to login once `deleteAccount` has ended the account).
6. The profile row and the route test.
7. The e2e happy path.
8. Full gate, then a live drive in the dev server with mocks.

## Risks

- The riskiest step is the 204. The backend ended every session, so any OPEN request that lands after it gets a 401, and `watchSessionExpiry` would show "You were signed out." The fix is to apply signed out synchronously, straight after the 204 and before any await. Test it.
- `offlineQueue.forget()` reads its account synchronously, so the listeners must run before `session.apply({status: 'signed_out'})`, whose effect calls `setAccount(null)`. Keep that order and test it.
- The catch-all mock and `client.ts` both react to 403 `mfa_required`, so the root layout's toast also appears. The dialog's own message must not contradict it. Accept both, as other screens do.
- `features/auth` cannot import `features/offline` (boundaries). The dialog gets the unsent count through the existing `signOutWarning()` hook or a parallel source set by the root layout, never a direct import.
- Copy drift against the Privacy Policy. Check every sentence against `site/public/privacy/index.html` "Deleting your account".

Chosen not to do:
- Change the "button is not built yet" sentences in `site/public/privacy/` and `site/public/terms/`. The app is not deployed (frontend#22), so they stay true on openpb.org until it is. Raise it in the PR.
- Clear the record-match draft in `sessionStorage`. Sign out does not clear it either, and it ends with the tab.
- A separate "Your account was deleted" page. The sign-in page notice reuses the existing alert pattern.
- Passkeys in the reauthentication prompt (#117).

## Proof

- Criterion 1: route test (row present, h2 order).
- Criterion 2: dialog component test reads the dialog text; copy reviewed against the Privacy Policy.
- Criteria 3 and 4: dialog component tests with mocked services, one per path.
- Criterion 5: services and session unit tests (listener order, flag, no expiry on a later 401), plus a root layout or listener test that `offlineQueue.forget()` runs.
- Criterion 6: login form test (deleted notice shown, "You were signed out." absent), session test (flag cleared by apply).
- Criterion 7: mock handler tests against `cookieJarApi()`.
- Criterion 8: `e2e/delete-account.spec.ts`.
- Live drive (High): in `pnpm dev` with mocks, delete `player@example.com` through the prompt (happy path), then the failure paths: Cancel in the prompt, `moderator@example.com` (mfa_required), `staff@example.com` (409), repeated attempts to 429, and a wrong typed word. Show the sign-in notice and that the old password no longer signs in.
- Measured on `origin/main` for the "phrase absent" test ("You were signed out." absent after a deletion): not measurable on main, which has no deletion. The test instead asserts the expired alert appears when `session.expire()` runs and is absent after `endDeletedAccount()`, so it shows it can fail.

## Steps

- [x] Mocks
- [x] Session flag and end-of-account
- [x] Delete service
- [ ] Login notice
- [ ] Dialog
- [ ] Profile row
- [ ] e2e
- [ ] Gate and live drive

## Decisions

- Typed word `delete`, case-insensitive and trimmed: short, plain, and the same word as the action.
- After deletion, the sign-in page with a notice rather than a new page.
- Reuse `onSignOut` listeners for the device cleanup, so sign out and deletion can't drift apart.
- `deleteAccount()` calls `endDeletedAccount()` itself, synchronously, as soon as it sees the 204, and the dialog does not call it again. Ending the account in the caller's next line leaves microtask hops (the service's resolve, `withReauth`'s `return await`, the dialog's await) where other callbacks, such as a 401 from a request that raced the delete, could still see a signed-in session and mark it expired. `endDeletedAccount()` stays exported. The service test "has ended the account before any code that waits on it runs" shows it.
- The dialog gets the unsent count from `setUnsentMatchesSource(source)` and `unsentMatches()` in `features/auth`, which the root layout sets from `offlineQueue.unsent`, the same pattern as `setSignOutWarning`. The dialog writes its own warning, because the sign-out warning says "signing out deletes". This keeps `features/auth` from importing `features/offline`.
