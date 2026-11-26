# Frontend v1.2: catch up with the backend after v1.1

**Status:** planned

## Goal

The app uses what the backend shipped between v1.1 (backend `f879640`, 2026-11-18) and backend `f4090e5` (2026-11-25):

- Players see their ratings, with reliability and a demonstration label, in place of the mocked card.
- Players can see and withdraw their disputes, vouch for held matches, and correct a match with no Event.
- Organizers can manage Events, upload CSV results files and settle disputes on their Events' matches.
- Players can report an organizer to OPEN Moderators.

This file is the analysis and the order of work. It changes no code. Each step below has, or needs, its own issue and PR.

## How this was checked (2026-11-25)

- Compared `openapi/openapi.json` on backend `origin/main` (`f4090e5`) with `app/src/lib/api/schema/open.json` on frontend `origin/main` (`71e8223`).
- Listed the endpoints the app calls in `features/*/services.ts` and `features/record-match/`.
- Read the backend ADRs from 0019 to 0041 and the open issues in both repositories.

Both local checkouts were behind `origin/main` when this was written: the backend by 571 commits, the frontend by #209 to #221. Pull both before you start, or `pnpm api:pull` copies an old schema. `pnpm api:pull` reads the backend checkout, so that one matters most.

## What the backend added

### New operations: 17, none used by the app yet

| Area | Operation | Endpoint | Frontend issue |
| --- | --- | --- | --- |
| Ratings | `get_player_ratings` | `GET /players/{code}/ratings` | #35 |
| Ratings | `list_player_rating_history` | `GET /players/{code}/rating-history` | #35 |
| Disputes | `list_my_disputes` | `GET /me/matches/disputes` | #214 |
| Disputes | `withdraw_match_dispute` | `POST /matches/{code}/withdraw-dispute` | #214 |
| Holds | `list_my_holds` | `GET /me/matches/holds` | #216 |
| Holds | `vouch_for_match` | `POST /matches/{code}/vouch` | #216 |
| Corrections | `correct_match` | `POST /matches/{code}/correction` | #215 |
| Organizer Events | `list_organizer_events` | `GET /organizer/events` | #217 |
| Organizer Events | `create_organizer_event` | `POST /organizer/events` | #217 |
| Organizer Events | `update_organizer_event` | `PATCH /organizer/events/{code}` | #217 |
| Organizer Events | `delete_organizer_event` | `DELETE /organizer/events/{code}` | #217 |
| Results files | `create_results_file` | `POST /organizer/events/{code}/results-files` | #218 |
| Results files | `get_results_file` | `GET /organizer/results-files/{code}` | #218 |
| Organizer disputes | `list_organizer_disputes` | `GET /me/matches/organizer-disputes` | #219 |
| Organizer disputes | `resolve_match_dispute` | `POST /matches/{code}/resolve-dispute` | #219 |
| Organizer disputes | `correct_disputed_match` | `POST /matches/{code}/dispute-correction` | #219 |
| Reports | `report_organizer` | `POST /organizers/{code}/reports` | #220 |

All paths start with `/api/v1`. Every one needs sign-in.

### Changes to shapes the app already uses

- `PrivacyIn` and `PrivacyOut` gain `rating_visibility` (ADR 0031). The profile settings form and the `me/player` mocks need it.
- `MyDecision` gains `withdraw`. `domain/models.ts` types `viewerDecision` as `'confirm' | 'dispute' | 'none'`, and `status-panel.svelte` and the fixtures only know `confirm` and `dispute`. A withdrawn dispute must not read as "you disputed this".
- The `MatchOut` description no longer says a moderator settles disputes (backend#299 removed moderator match review). Check the app's dispute copy for the word "moderator".

### Backend changes outside the OpenAPI document

- **CSRF cookie name in production (ADR 0040, backend#102).** With DEBUG off, the CSRF cookie is `__Host-csrftoken`, and the session cookie is `__Host-sessionid`. `api/csrf.ts` reads `csrftoken` only, so a production app would send no `X-CSRFToken` and every unsafe call would get a 403. The file already notes this might happen. Tracked in #222.
- **Emails link into the app.** Dispute, hold and recorded-match notices (backend#272, backend#300) open `/matches/{code}`, which exists. Once #214 and #216 land, that page must explain a disputed or held match.
- **Signup** (legal agreements, name and place, password check: ADR 0022, 0026, 0039) is already done in the app (#197, #211, #212).
- **Security headers** (ADR 0040) apply to the API's responses, not to the app's static files. Hosting the app (frontend#22) needs its own policy.

### Still missing in the backend

These block app work. The app can't do them yet.

| Need | Blocks | Backend issue |
| --- | --- | --- |
| A way to tell whether an account belongs to an organizer, and the organizer's code | #217, and #218 and #219 after it | backend#301 |
| The Event and its organizer (code, name) on `MatchOut` | #220. Also lets #215 hide "Correct the score" on Event matches. | backend#302 |
| Player data export | The export part of #109 (charter) | backend#39 |
| Account deletion | An account deletion control | backend#116 |
| Passkeys and MFA | Account security pages | backend#99, backend#117 |
| Re-accepting new legal agreement versions | A re-accept screen | backend#237 |

`GET /api/v1/accounts/me` and the health endpoints exist, and the app doesn't need them yet.

## Steps

- [x] S0 Read the CSRF token from `__Host-csrftoken` when it is set, else `csrftoken`, with tests (#222). Independent of the rest. It must land before the app is hosted (frontend#22).
- [x] S1 Sync the API schema with backend `f4090e5` or later (#213). Include `rating_visibility` and `MyDecision.withdraw`, so `pnpm check` and the tests pass. Leave the new operations unused.
- [x] C1 Remove the typed-in own code fallback for backends older than #124 (#223), after S1 and before S3
- [x] S2 Swap the mocked ratings for the real endpoints, and add the `rating_visibility` control (#35, and the privacy part of #109), after S1
- [x] S3 Show disputed matches and let players withdraw a dispute (#214), after S1
- [x] S4 Show held matches and let players vouch for them (#216), after S3
- [ ] S5 Let players correct a pending or disputed match with no Event (#215), after S3
- [x] B1 Open backend issues for organizer memberships (backend#301) and for the Event on `MatchOut` (backend#302)
- [ ] S6 Organizer area: list, create, edit and delete Events (#217), after S1 and B1
- [ ] S7 Upload a CSV results file and read its report (#218), after S6
- [ ] S8 Settle disputes on an Event's matches (#219), after S6
- [ ] S9 Report an organizer (#220), after S1 and the `MatchOut` part of B1

### Order and overlap

- S0 and S1 can run at the same time. They touch different files.
- C1 changes the matches, record and profile views and `features/players`. Do it before S3, so the dispute, hold and correction work starts from the smaller views. It also touches the profile page, so run it before S2 or rebase S2 onto it.
- S2 stays in `features/players` and the profile page, so it can run beside S3.
- S3, S4 and S5 all change the match page (`match-view.svelte`, `status-panel.svelte`), the home lists and the match fixtures. Run them one after another, not in parallel. S3 goes first because it settles how a non-pending status reads.
- S5 reuses the record-match form. Decide in S5 whether to treat the 404 on an Event match as "only the organizer can change this", or wait for the Event on `MatchOut` and hide the action.
- S6 to S9 wait on the backend. S7 and S8 can run in parallel after S6, since one is about files and the other about disputes.

## What to start next

1. S0. It is small and, without it, the hosted app can't sign in or record a match.
2. S1. Every other step needs it.
3. B1 is done (backend#301, backend#302), so the backend can work on them while S2 to S5 are under way.
4. C1.
5. Then S2 and S3 side by side.

## Decisions

- **Reuse the existing feature issues.** #213 to #220 and #35 already describe S1 to S9 well. This plan orders them and adds S0, B1 and C1. It doesn't restate them. The missing details went on the issues as comments: `MyDecision.withdraw` on #213, and the app's own security headers on #22.
- **Don't file frontend issues for backend work that hasn't shipped.** Account deletion, passkeys and MFA, and re-accepting legal agreements wait until the backend issues close.
- **Players see demonstration ratings (S2, decided by the project owner).** The profile shows the ratings the API returns, each with a "Demonstration" badge and its reliability out of 100, under one line: "These are demonstration numbers while the rating method is being built." Nothing calls a number an OPEN rating (rule 3) and no scale is mentioned (`plans/site-content-v2/plan.md`). Rating history is its own issue (#233).
- **How a match's status reads (S3).** `features/matches/status.ts` (`matchStatusCopy`) holds the title, text, notes and actions for every status. S4 and S5 add their action there and in `status-panel.svelte`, not in the views.
- **One dispute per player (S3).** The backend treats a withdrawn dispute as the player's one dispute, so after a withdraw the app offers Confirm only, never Dispute. A player with no open dispute on a disputed match gets no button.
- **No end date for disputes (S3).** The API gives none, and doesn't say whether a match has an Event, so the copy says a dispute ends when every player who disputed withdraws, when an Event's organizer settles it, or after a set time when the match is voided. No copy mentions a moderator.
- **The backend enforces who may act.** The organizer area and the vouch, correct and resolve controls only hide what the backend would refuse anyway (rule 6). Each step handles the 403, 404 and 409 answers in plain words.
- **Only the holds list says a match is held (S4).** `MatchOut` has no hold field, so the match page reads `GET me/matches/holds` beside the match, and the home and history pages read it too. The cache keeps each known hold. A held match the viewer may not vouch for (an event match, for its players) reads as its plain status, since the API doesn't say it is held.
- **Organizers open a held event match from the holds list (S4).** `GET matches/{code}` gives players only, so an organizer member who follows the hold email to `/matches/{code}` would get a 404. The page shows the match from the holds list then. A viewer with no team in the match can only be such a member, so the vouch copy speaks to the organizer.
- **How a held match reads (S4).** A pending or confirmed held match reads "On hold" with an "On hold" badge next to its status, says why without naming the other match, keeps Confirm and Dispute when they apply, and offers "This match really happened" until the viewer's side has vouched. A disputed held match keeps its dispute copy and adds the hold. The vouch answer doesn't say whether the hold ended, so the page reads the holds list again. Like disputes, the copy promises no end date.

## Open questions

- Should the organizer area be a separate section in the side nav and tab bar, or a page under the profile? This changes the app shell, so decide in S6.
- The dispute and hold periods (30 and 14 days by default) are backend settings, and the API returns no end date. Should the backend add one, so the app can say when a match will end?
