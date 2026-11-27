# Plan: Let organizers list, create, edit and delete their Events (issue #217)

**Status:** done

Risk tier: High. The change gates a whole area on organizer membership and two-factor authority (permissions are a forced High). It also adds stateful dialogs, a new route guard, and nav changes across about 20 files.

Domain skills: superpowers:test-driven-development, invoke. django, django-allauth, django-ninja-api and django-celery are not applicable, because the backend does not change. frontend-design and impeccable are not applicable, because the screens reuse the design system and the `plans/ux-cleanup` patterns (Section, page-title, one section pattern), with no new visual direction.

This is step S6 of `plans/frontend-v1-2/plan.md`. It answers that plan's open question about where the organizer area goes: a nav entry, as the issue says.

## Goal

An organizer member can manage their organizers' Events in the app, so no one needs Django admin access to set one up. Players who aren't members never see the area, and the app never calls the Event operations for them.

## Acceptance criteria

1. **Nav, members only.** When `session.isOrganizer` is true, the side nav (from `lg`) and the tab bar (below `lg`) render an "Events" entry linking to `/organizer`. When it is false, including while the memberships load and after the read fails, the entry is not in the DOM. The tab bar lays out 4 or 5 items to match the entries rendered.
2. **Route guard.** `/organizer` is a signed-in page: signed out, it redirects to sign-in with `next`. Its `load` waits for the memberships read. A signed-in non-member gets the app's not found page (`+error.svelte` with status 404, "We couldn't find this page"), the same as an unknown route. No organizer wording renders, and no request goes to `/api/v1/organizer/events` or `/api/v1/organizer/organizers/{code}/club-grants`.
3. **List.** A member sees their Events from `GET /api/v1/organizer/events`, newest start date first, as the API orders them. Each row shows the name, the kind in plain words ("Tournament", "League", "Verified rec play"), the organizer's name (looked up from the memberships, falling back to the code), and the dates. The list shows 20 at a time, with Newer and Older like the match history. It has an empty state and a loading state. A failed read shows an error with a Try again button.
4. **Organizer status callouts.** Above the list, each membership whose organizer is not verified reads as waiting for verification ("<name> is waiting for verification. You can create Events once OPEN verifies it."). When `session.mfaEnrolled === false`, the existing `OrganizerMfaPrompt` shows, which links to two-factor setup (#261). Neither callout blocks reading the list.
5. **Create.** "New Event" opens a dialog with name, kind (a radio group or native select in plain words), organizer (a native select of the verified memberships; preselected and shown as text when there is only one), optional club, start date and end date (`<input type="date">`, `YYYY-MM-DD` strings). The button shows only when at least one membership is verified. It calls `POST /api/v1/organizer/events` and adds the result to the list.
   - Client checks before sending: name required, at most 200 characters after trimming; both dates required; end date not before start date. These are convenience only. The backend checks again.
   - 422 field errors show on their fields (`name`, `kind`, `organizer`, `club`, `start_date`, `end_date`). Any other field, or none, shows as a form-level error.
   - A 403 reads plainly: "You can't create Events for this organizer right now. The organizer must be verified, and you need two-factor sign-in turned on." It links to `/profile/two-factor` when `mfaEnrolled` is not true. The app then reads the memberships again (`loadAccountState`).
   - A 403 with code `mfa_required` keeps the app-wide toast from #261 and shows the same form-level message.
   - A 409 reads "The Event could not be saved. Try again."
6. **Club field.** For an admin member, the dialog reads `GET /api/v1/organizer/organizers/{code}/club-grants` for the chosen organizer and offers a native select: "No club", then each granted club by name (and city). For a `match_manager` member, or if the grants read fails (403 `mfa_required`, 404, network), the field is an optional club code text input with a hint that the club gives the code. The grants are read only when the dialog opens for an admin, never for a non-member. A 422 on `club` shows the backend's message on the field.
7. **Edit.** Each row has Edit, which opens the same dialog filled from the row. The organizer and club show as text and can't change (the API refuses them). `PATCH /api/v1/organizer/events/{code}` sends only the fields that changed. With nothing changed, Save closes the dialog without a request. On success the row updates in place.
   - The dialog says the kind applies only to matches recorded after the change.
   - A 409 reads "This Event has matches, so its name and dates can't change. You can still change the kind."
   - A 404 reads "This Event can't be changed. It may have been deleted, or you may no longer manage it." The app then reads the list and the memberships again.
   - 422 is handled as in criterion 5.
8. **Delete.** Each row has Delete, which confirms in an alert dialog naming the Event. `DELETE /api/v1/organizer/events/{code}` with a 204 removes the row.
   - A 409 reads "This Event has matches or results files, so it can't be deleted."
   - A 404 is handled as in criterion 7.
9. **Membership lifetime.** The memberships still load once per signed-in session (#261), are cleared on sign out and expiry, and are cleared when the account changes. A member removed mid-session loses the nav entry and the page on the next session check (a reload). A 403 on create or a 404 on edit or delete triggers a fresh memberships read, so the area goes away then too. Account deletion (#265) is not built yet. Whatever ends the session there goes through `session.apply`, which already clears them.
10. **Roles.** `admin` and `match_manager` get the same screens. The only difference is the club picker (criterion 6), because only admins can read the grants.
11. **Mocks.** Made-up organizers and Events in the mock store. `GET organizer/events` pages by `limit` and `offset` over the signed-in account's memberships' Events, newest start date first. Create, update and delete follow the backend's rules: authority needs a verified organizer, membership and TOTP (403 on create, 404 on update and delete otherwise); 409 on name or date change and on delete when the Event has matches; 422 on `club`, on dates and on name; and `club-grants` for admins only. Fixtures: the existing `organizer@example.com` (admin of a verified organizer) gains Events, one with matches. A new made-up `manager@example.com` is a `match_manager` of the same organizer and also a member of a made-up unverified organizer, with TOTP on. `player@example.com` stays a non-member.
12. **Display only.** Every check in the app is display only (rule 6). The backend's 403 and 404 answers are handled, never assumed away.
13. **No real player data, no competing system names, nothing called an OPEN rating.** Copy says "Event" and "organizer". Nothing says "user".

Not in this issue: organizer-only parts on shared pages (such as on a match page, compared with `MatchOut.event.organizer`). Nothing on a shared page is organizer-only yet. #218 and #219 add the first ones, and they follow the issue's rule: render only for a member of that Event's organizer. This plan adds a `session.isMemberOf(organizerCode)` helper, with tests, for them to use.

## Files that change

Paths are under `app/src/` unless they say otherwise.

**Domain**
- `lib/domain/models.ts`: `EVENT_KINDS = ['tournament', 'league', 'rec_verified'] as const`, `EventKind`, an `OrganizerEvent` type (`code`, `name`, `kind`, `organizer`, `club: string | null`, `startDate`, `endDate`), and `EVENT_KIND_LABELS`. It may not be named `Event`, because that shadows the DOM type.
- `lib/domain/mappers.ts`: `toOrganizerEvent(EventOut)` and `toOrganizerEventPage(PagedEventOut)`, which throw `MappingError` on an unknown kind.
- `lib/domain/schemas.ts`: a Zod schema for the Event form, with backend-style keys and the client checks in criterion 5. `EVENT_NAME_MAX = 200`.
- Tests: `mappers.test.ts`, `schemas.test.ts`, and `lib/mocks/schema-drift.test.ts` (pin `EventKind`, `MemberRole` and the events `limit` maximum to `schema/open.json`).

**Auth**
- `lib/features/auth/session.svelte.ts`: `isMemberOf(code: string): boolean`, compared after normalizing both codes (uppercase, hyphens removed).
- `lib/features/auth/services.ts` and `index.ts`: `organizerMemberships(): Promise<OrganizerMembership[]>`. It awaits the session (`requireSession`) and then any memberships read in flight. If the list is still null (the session is signed in but no read ran, or the read failed and the store reset), it runs `loadAccountState()` once. It returns `session.organizers ?? []`. Also export `loadAccountState` for the refresh after a 403 or 404.
- `lib/features/auth/guard.ts`: add `/organizer` to `GUARDED_BASES`.
- `lib/domain/routes.ts`: `organizer: '/organizer'`.

**Feature `lib/features/organizer/` (new)**
- `services.ts`: `listOrganizerEvents(offset, {limit, api})`, `createOrganizerEvent(input)`, `updateOrganizerEvent(code, changes)`, `deleteOrganizerEvent(code)` and `listClubGrants(organizerCode)`, using `unwrap` and the `ApiOption` pattern from `features/players/services.ts`.
- `event-form.svelte.ts`: the form state class (fields, client errors, server field errors, form error, submitting), modeled on `features/record-match/form.svelte.ts` and `features/auth/forms.ts` (`serverMessages`, `focusFirstError`). It builds the PATCH body as a diff against the original Event. It maps each status to the copy in criteria 5 to 8, in one `eventErrorCopy(error, action)` function in `copy.ts`.
- `copy.ts`: every string from criteria 4 to 8, so the tests and components share them.
- `components/organizer-events.svelte`: the page body. It has the callouts, the New Event button, the list (rows with name, kind badge, organizer, dates, Edit and Delete), Newer and Older, and the empty, loading and error states.
- `components/event-dialog.svelte`: the create and edit dialog on `lib/ui/dialog`, with `Field`, `TextField`, `SelectField`, `RadioGroup` or `NativeSelect`, and `Input type="date"`.
- `components/club-field.svelte`: the picker or code input (criterion 6).
- `components/delete-event-dialog.svelte`: on `lib/ui/alert-dialog`, like `features/matches/components/action-dialog.svelte`.
- `index.ts`: the public exports. The boundaries rules allow routes to import only this file.
- Tests: `services.test.ts` (node, MSW: every status in criteria 5 to 8, paging, grants), `event-form.svelte.test.ts` (diff, client checks, error mapping), `components/organizer-events.svelte.test.ts`, `components/event-dialog.svelte.test.ts`, and `components/club-field.svelte.test.ts` (browser project).

**Routes**
- `routes/organizer/+page.ts`: `load` calls `organizerMemberships()` and throws `error(404, 'Not Found')` when the list is empty. It returns the `page` from the search params, as `routes/matches/+page.ts` does.
- `routes/organizer/+page.svelte`: a page title "Events" and `<OrganizerEvents>`.
- `routes/+layout.svelte`: pass `organizer={session.isOrganizer}` to `AppShell`.
- `routes/routes.test.ts`: add the page and its title to `expected`.
- `routes/organizer/organizer-route.test.ts` (node): a non-member gets a 404 and no `organizer/events` request. A member gets the page data. Signed out, the load redirects.

**App shell (ui may import only ui)**
- `lib/ui/app-shell/nav.ts`: add an `events` icon name and `/organizer` to the `href` union. Add an `ORGANIZER_ITEM` and a `navItems(organizer: boolean)` helper that returns `NAV_ITEMS`, or `NAV_ITEMS` plus the Events item before Profile.
- `nav-icon.svelte`: a Lucide icon for Events (`CalendarDays`).
- `app-shell.svelte`, `side-nav.svelte`, `tab-bar.svelte`: take `organizer?: boolean` (default false) and loop over `navItems(organizer)`. The tab bar uses `grid-cols-5` when it has 5 items, else `grid-cols-4`, as two literal classes so Tailwind sees both.
- Tests: the existing app-shell tests, extended. With `organizer` false there is no Events link in either nav, and with it true there is one in each.

**Mocks**
- `lib/mocks/store.ts`: an `events` collection keyed by code, with `organizer`, `club`, `hasMatches` and `hasUploads`. Organizers are a fixture table (code, name, verified, club grants). Event codes come from a counter (`E-MOCK-0001` and so on, made up).
- `lib/mocks/fixtures.ts`: the accounts, organizers, clubs and Events in criterion 11. All names are made up.
- `lib/mocks/handlers/open.ts`: replace the #261 stubs for `GET` and `POST organizer/events`, and add `PATCH` and `DELETE organizer/events/{code}` and `GET organizer/organizers/{code}/club-grants`. Keep the `mfa_required` gate. Keep the two-factor e2e (`e2e/two-factor.spec.ts`) passing: a member without TOTP still gets 403 on create.
- Bump the mock storage key if the stored shape changes, as #261 did.
- Tests: `lib/mocks/organizer-events.test.ts`, on the handler rules.

**e2e**
- `e2e/organizer-events.spec.ts`:
  - `player@example.com` sees no Events entry. `/organizer` shows "We couldn't find this page". No request matched `/api/v1/organizer/events` or `club-grants` during the visit.
  - `organizer@example.com`, without TOTP, sees the entry, the list and the two-factor callout. Create gets the 403 copy.
  - `manager@example.com` (TOTP, signs in with `MOCK_TOTP_CODE`) sees the unverified callout. They create an Event with a club code, edit its kind, get the 409 on renaming the Event that has matches, and delete the new Event.
  - An admin with TOTP sees the club picker. For this, the spec turns TOTP on for `organizer@example.com` through `window.__openMock` or a fixture variant; decide which while implementing.
  - Removing the membership in `window.__openMock` and reloading takes the entry away and makes `/organizer` not found.

**Docs** (Phase 8 checks these): `app/AGENTS.md` only if a rule changes, `plans/frontend-v1-2/plan.md` (tick S6, answer the open question), and this plan.

## Order of work

1. Domain types, mappers and the schema, with tests (red first).
2. Mock store, fixtures and handlers, with handler tests. Keep `e2e/two-factor.spec.ts` green.
3. Auth: `isMemberOf`, `organizerMemberships`, the `/organizer` guard base, and `ROUTES.organizer`, with tests.
4. Feature services, with node tests against the mocks.
5. The form state and copy, with tests.
6. Components, with browser tests.
7. The route and its load, with the not-found test and the `routes.test.ts` entry.
8. App shell nav, with tests.
9. The e2e spec.
10. The full gate (in `app/`: `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:coverage`, `pnpm build`, then `PUBLIC_API_MOCK=off pnpm build` and `pnpm check:build`, then `pnpm e2e`), then the live drive.

## Risks

- **The not-found page flashes or leaks.** `load` must wait for the memberships before deciding, and the nav must read `isOrganizer`, which is false while loading. Test both. The 404 must use SvelteKit's `error(404)` so `+error.svelte` renders the same page as an unknown route.
- **The memberships read races the route load.** The read starts without being awaited after sign-in (`applyState`). `organizerMemberships()` must await it, and must start one if none ran. This is the riskiest step: get it wrong and a member gets not found right after signing in. Test sign-in followed straight away by `/organizer`.
- **A PATCH that sends unchanged fields** would get a 409 on an Event with matches, even for a kind-only change. The diff must leave them out.
- **Breaking #261.** The stubs it relies on change. Its e2e and its node tests must stay green.
- **Tab bar width.** Five items on a 360px phone. Check the labels fit ("Events" is short) and that the needs-you badge still sits right.
- **CSP.** No new origin. The club grants are same-origin API calls.
- **Copy rules.** No "user", no competing system names, no "OPEN rating", and no em dashes.

What this does not do: organizer-only parts on shared pages (see the note above), results files (#218), disputes (#219), and account deletion (#265).

## Proof

| Criterion | Proof |
| --- | --- |
| 1 | app-shell tests (entry absent or present in both navs, tab bar columns). e2e: no entry for the player, entry for the members. |
| 2 | `organizer-route.test.ts` (404 for a non-member, no `organizer/events` request, redirect when signed out, member passes right after sign-in). e2e: not found for the player, and no matching request recorded with `page.on('request')`. |
| 3 | `services.test.ts` (paging), `organizer-events.svelte.test.ts` (rows, kind labels, organizer name fallback, empty, loading, error with retry). |
| 4 | `organizer-events.svelte.test.ts` (unverified callout, two-factor prompt). e2e for the manager and the organizer. |
| 5, 7, 8 | `services.test.ts` and `event-form.svelte.test.ts` (each status to its copy, the PATCH diff, client checks), `event-dialog.svelte.test.ts`. e2e create, edit, 409 and delete. |
| 6 | `club-field.svelte.test.ts` (admin picker, manager code input, fallback on a failed read). `services.test.ts` (grants 404 for a manager). e2e picker for the admin. |
| 9 | `organizer-route.test.ts` and e2e (membership removed, then reload). A services test that a 403 on create triggers a memberships read. |
| 10 | Both roles' e2e use the same page. |
| 11 | `lib/mocks/organizer-events.test.ts`, `schema-drift.test.ts`. |
| 12, 13 | Review. A grep of the new copy for "user", "OPEN rating" and em dashes. |

**Live drive (High tier).** Run `pnpm dev:stack` (the real local backend, seeded) and `pnpm dev` with `PUBLIC_API_MOCK=missing`. In the backend shell, give a seeded account an admin membership in a verified organizer, with TOTP set up in the app, and a club grant. Drive the changed path: list, create with the club picker, edit the kind, delete. Then drive the failure and edge paths:
- edit the name of an Event that a match names (seed one in the shell): 409;
- delete it: 409;
- end date before start date: 422 on the field;
- a club without a grant, typed as a code: 422;
- a password-only session: `mfa_required`;
- remove the membership in the shell and reload: the area is gone;
- a non-member account: no Events entry, not found at `/organizer`, and no `organizer/events` request in the network log.

If the backend can't run, say so and record the mocks-only evidence.

Measured on `origin/main` (`c6c7374`, 2026-11-27), for the "no request" and "no organizer wording" tests:
- `grep -rn "organizer/events" lib routes --include='*.ts' --include='*.svelte' | grep -v "mocks\|generated\|test"` (in `app/src`) prints nothing: no app code calls the Event operations today. The only caller of an organizer operation is `readAccountState` (`GET organizer/organizers`), which runs for every signed-in account by design (#261). So the e2e assertion covers `organizer/events` and `club-grants`, not every `organizer/` path.
- `grep -rniI organizer routes lib/ui --include='*.svelte' | grep -v test` prints only `routes/profile/two-factor/+page.svelte`, the import and use of `OrganizerMfaPrompt`, which renders nothing for a non-member. The nav has no organizer entry today.

## Decisions

- 2026-11-27, with the user: create and edit are dialogs on `/organizer`, not their own pages. The API has no single-Event read, so an edit page would have to page through the list after a reload.
- 2026-11-27, with the user: the club is a picker from `club-grants` for admin members, and an optional club code input for a `match_manager` or when the grants read fails. Only admins can read the grants.
- The organizer area is a nav entry ("Events", `/organizer`), shown only to members. The issue asks for one, and it answers the open question in `plans/frontend-v1-2/plan.md`.
- A member without two-factor gets 403 on create and 404 on edit and delete, the same answer as for an unverified organizer or a non-member. So the copy covers every cause, and the app uses what it knows (`verified`, `mfaEnrolled`) to say which applies ahead of time.
- 2026-11-27, while implementing: the API snapshot (`app/src/lib/api/schema/open.json`) had no `club-grants` operation, so step 0 pulls it from backend 925bb69 (`pnpm api:pull`, `pnpm api:gen`). The pull also brings operations this issue does not use, and adds `verification_requested` to `OrganizerMembershipOut`. The mock fixture and the tests that build a membership gain that field, set to false. Nothing in the app reads it yet.
- 2026-11-27, while implementing: the e2e gets an admin with TOTP through `window.__openMock.turnOnTwoFactor(email)`, not a fixture variant. The mock store gains `turnOnTwoFactor` and `removeMembership`, and the browser mock exposes both. A fixture variant would add a fifth organizer account only for one test, and enrolling through the two-factor screens is already covered by `e2e/two-factor.spec.ts`. The same helper object takes the membership away for the reload test.
- 2026-11-27, while implementing: `organizerMemberships(url, options)` takes the URL, as `requireSession` does, and lives in the auth `index.ts` beside it. The waiting part is `settledMemberships` in `services.ts`. `requireSession` takes an optional `{ api }` too, so node tests can pass a client.
- 2026-11-27, while implementing: the services, not the form, read the memberships again after a 403 on create or a 404 on a change or delete. So the delete dialog gets it too. The `/organizer` page runs its load again (`invalidateAll`) when the memberships come back empty, so the area goes away at once.
- 2026-11-27, while implementing: `OrganizerMfaPrompt` has no link (#284 moved the link to the page around it), so the Events page puts a "Set up two-factor" link under it.
- 2026-11-27, while implementing: the delete dialog stays open until the backend answers, so a 409 or 404 shows in it.
- 2026-11-27, while implementing: `TextField` takes `type="date"`, so the dates reuse it with the native date picker.
- 2026-11-27, while implementing: the domain tests are in `lib/domain/organizer-event.test.ts`, and the form test runs in node (`event-form.test.ts`) against the mocks, not in the browser project. A route test swaps the app-wide client for `cookieJarApi()` from `lib/mocks/node.ts`.
- 2026-11-27, while implementing: the stored mock state gains Events, so the storage key moves to `open-mock-state-v3`, and `e2e/record.spec.ts` reads it there.
- 2026-11-27, review F1: an admin with `session.mfaEnrolled === false` gets the club code input and no `club-grants` read, since the backend would answer 403 `mfa_required` and fire the app-wide toast. The read still runs when two-factor is on or unknown.
- 2026-11-27, review F4: a failed memberships read sets `session.organizersFailed`. The account still counts as a non-member (nav hidden, not found), but the next `/organizer` visit reads again, one read per visit. A read that worked and found none is not read again.
- 2026-11-27, review F5: after a create or a delete the Events page reads its page again, rather than changing the rows by hand, so a new Event lands on its own page and the next one moves up after a delete. Criterion 5's "adds the result to the list" happens through that read. An edit still replaces its row.
