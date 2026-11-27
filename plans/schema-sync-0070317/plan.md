# Plan: Sync the API schema with backend 0070317 (issue #263)

**Status:** done

Risk tier: Medium. Low start, raised one tier because the API schema changes. Type checking covers the absorbed change fully, so no further raise.

Domain skills: superpowers:test-driven-development, invoke (the red test below). frontend-design and impeccable, not applicable because no UI changes. django, django-allauth and django-ninja-api, not applicable because the backend is only read, never changed. vercel-react-best-practices, not applicable because the app is Svelte.

## Goal

The committed API snapshots and generated types match backend `0070317`, so the feature issues that use the new operations and fields can start. The app's behavior does not change.

## Acceptance criteria

1. `app/src/lib/api/schema/open.json` is backend `0070317`'s `openapi/openapi.json`, as `pnpm api:pull` copies and formats it. `app/src/lib/api/generated/open.d.ts` is what `pnpm api:gen` makes from it, so rerunning `pnpm api:gen` changes nothing.
2. `open.json` has `delete_current_account` (`DELETE /api/v1/accounts/me`), `list_my_organizers` (`GET /api/v1/organizer/organizers`), the schemas `OrganizerMembershipOut`, `MemberRole`, `MatchEventOut` and `MatchClubOut`, and `MatchOut.event` and `MatchOut.club`, both required and nullable. No operation or schema is removed.
3. `app/src/lib/api/schema/allauth.json` is the document a local backend at `0070317` serves at `/_allauth/openapi.json`, formatted by `pnpm api:pull:allauth`, and `allauth.d.ts` is regenerated from it. It has these 10 operations it did not have: `POST auth/2fa/authenticate`, `POST auth/2fa/reauthenticate`, `GET account/authenticators`, `GET`, `POST` and `DELETE account/authenticators/totp`, `GET` and `POST account/authenticators/recovery-codes`, `GET` and `DELETE auth/sessions`. No operation is removed.
4. Every match the mock store serves (`matchOut` in `app/src/lib/mocks/store.ts`) has `event: null` and `club: null`, and the `MatchOut` factory in `app/src/lib/domain/mappers.test.ts` has both as `null`.
5. No app code outside `app/src/lib/api/schema/`, `app/src/lib/api/generated/` and the two files in criterion 4 reads `event`, `club`, the two new OPEN operations or the new allauth operations. No screen, copy or mapper changes. `toMatch` keeps ignoring the new fields.
6. The full gate passes in `app/`: `pnpm format:check`, `pnpm lint`, `pnpm check` (0 errors), `pnpm test`, `pnpm build`, a `PUBLIC_API_MOCK=off` build followed by `pnpm check:build`, and `pnpm e2e`.
7. Docs that the new snapshot makes wrong are corrected: the `MockMatch.event` comment in `store.ts` (it says `MatchOut` can't show an Event) and the line in `app/src/lib/api/README.md` that lists sessions among the allauth endpoints OPEN disables. So is every comment in `app/src` that says `MatchOut` can't show a match's Event or Club. Each of those comments now says the API sends them, the app does not read them yet, and frontend#264 will use them.

## Files that change

- `app/src/lib/api/schema/open.json`, `app/src/lib/api/generated/open.d.ts` (generated)
- `app/src/lib/api/schema/allauth.json`, `app/src/lib/api/generated/allauth.d.ts` (generated)
- `app/src/lib/mocks/store.ts`: `matchOut` returns `event: null, club: null`. The `MockMatch.event` doc comment says the mock always sends `event` and `club` as `null`, and showing them is its own issue. The `event?: boolean` flag itself stays (tests use it for the `correct_match` 404).
- `app/src/lib/domain/mappers.test.ts`: `dto()` has `event: null, club: null`.
- `app/src/lib/features/matches/status.ts`, `app/src/lib/features/matches/index.ts`, `app/src/lib/features/record-match/form.svelte.ts`: comments only (criterion 7). They said `MatchOut` can't show the Event or Club.
- One test file for the red test (below): `app/src/lib/mocks/fixtures.test.ts` or `app/src/lib/mocks/integration.test.ts`, whichever already reads served matches.
- `app/src/lib/api/README.md`: the allauth line no longer lists sessions among the endpoints OPEN disables.
- This plan.

## Order of work

1. Regenerate: in `app/`, `BACKEND_DIR=/home/bradstricherz/WebstormProjects/backend pnpm api:pull`, then `pnpm api:pull:allauth` (the backend runs on 127.0.0.1:8000 at `0070317`), then `pnpm api:gen`. The worktree is under `.claude/worktrees/`, so the default `../backend` does not resolve: `BACKEND_DIR` is needed. Commit the four generated files alone.
2. Red test: a test that every match the mock serves has `event` and `club` equal to `null`. Run it and record the failure. Commit it.
3. Fix: add the fields to `matchOut` and to `dto()`, and update the `MockMatch.event` comment. Commit.
4. Run the full gate.

## Risks

- A stale backend checkout would copy an old schema. Measured: the backend checkout is at `0070317`, which is its `origin/main`.
- `api:pull:allauth` reads whatever server answers on port 8000. It must be the backend at `0070317`, started from that checkout.
- 29 existing operations now document a 403 `mfa_required` (19 gained a 403, and 10 had their 403 text extended). The backend sends it to an account that must have two-factor (staff, superusers, moderators, owners of a production application) and has none, and to an account with two-factor whose session did not pass it, such as a password-only session. Players can't turn on two-factor in the app yet, so today only those staff accounts meet it. The app's error handling maps a 403 it doesn't know to a permission refusal. Handling `mfa_required` belongs with the two-factor UI, not here, so this change leaves it alone and the PR notes it.
- Not done on purpose: showing the Event or Club on a match, hiding "Correct the score" on event matches, account deletion, the organizer list, two-factor and session screens. Each has its own issue.

## Proof

- Criteria 1 to 3: the regen commands, then `git diff --stat`, then `pnpm api:gen` again with no diff. The added operations are checked with a node script that lists operation ids and paths in the old and new snapshots.
- Criterion 4: the red test, failing before step 3 and passing after. `pnpm check` 0 errors.
- Criterion 5: `git diff --stat origin/main` names only the files above, and `grep` for `\.event\b|\.club\b|delete_current_account|list_my_organizers|authenticators|auth/sessions|2fa` outside `api/` finds nothing new.
- Criterion 6: the gate output.
- Live drive: the change is types and mock fields with no behavior change, and the gate (type check, unit, browser and e2e tests on the mock) covers it fully, so a manual drive is not required.

Measured on `origin/main` (`ac7aad1`) before the plan was written:

- Trial regen, then `pnpm exec svelte-check --output machine`: 2 errors, `src/lib/mocks/store.ts:757` (missing `club`, `event`) and `src/lib/domain/mappers.test.ts:24` (`club` may be undefined). The tree was restored after.
- Operation diff of the OPEN snapshot against backend `openapi/openapi.json`: added `delete_current_account`, `list_my_organizers`. Removed none. New schemas `MatchClubOut`, `MatchEventOut`, `MemberRole`, `OrganizerMembershipOut`. Changed schema `MatchOut`.
- Operation diff of the allauth snapshot against the running backend: the 10 operations in criterion 3 added, none removed.
- `pnpm test` on `origin/main`: 1748 passed, 1 failed (`queue-notice.svelte.test.ts`, "Frame was detached"). That file passed 3 of 3 runs alone, so it is flaky, not broken.

## Decisions

- **The mock sends `event` and `club` as `null` even for a match with the `event` test flag.** The issue asks for `null` and leaves the fields unused. Filling them belongs to the issue that shows them.
