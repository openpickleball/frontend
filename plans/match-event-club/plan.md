# Show a match's Event and Club and hide Correct on organizer matches (issue #264)

**Status:** done

Risk tier: High. It changes existing behavior (the Correct action, the dispute and vouch copy) across about 15 files in the domain, mocks, features and e2e layers. Nothing is security sensitive: the backend still refuses a correction with a 404.

Domain skills: superpowers:test-driven-development, invoke. frontend-design and impeccable, not applicable because the change adds two rows to an existing `<dl>` and changes copy, with no new visual design. No Svelte, SvelteKit or Tailwind skill is installed. The repo's own rules (app/AGENTS.md: Reuse before you build, spacing, the copy rules in `status.test.ts`) apply instead.

## Goal

`MatchOut` now sends `event` (`MatchEventOut`: code, name, organizer code) and `club` (`MatchClubOut`: code, name), each null when the match has none (backend#302, ADR 0053). The app reads them. The match page names the Event and the Club. It stops offering "Correct the score" on a match players can't correct. It says who settles a dispute or a hold on this match, instead of covering both cases in one sentence.

Who settles what, from backend ADR 0034:

- A dispute ends when every player who disputed withdraws. On a match with an Event, the Event's organizer can also settle it. A match with only a Club has no organizer level, so its players settle it, as on a match with neither.
- A hold ends when each match is vouched for at its own level. A match with no Event: one player from each team. A match with an Event: the Event's organizer.
- Either way, an unsettled dispute voids the match after a set time, and an unsettled hold voids the newer match (unchanged).

## Acceptance criteria

1. The domain `Match` has `event: { code: string; name: string; organizer: string } | null` and `club: { code: string; name: string } | null`, mapped from `MatchOut` by `toMatch`. No Organizer name is read, stored or shown anywhere.
2. The match page's Details section shows an "Event" row with the Event's name when the match has an Event, and a "Club" row with the Club's name when it has a Club. A match with neither shows neither row. A match with both shows both.
3. `canCorrect` returns false for a match with an Event or a Club, so the status panel never offers "Correct the score" on one. A match with neither keeps today's rules (pending or disputed, the viewer played, every player has a code).
4. `/matches/<code>/correct` for a pending or disputed match with an Event or a Club shows a reason instead of the form. With an Event: only the Event's organizer can change it. With only a Club: "A match recorded for a club can't be corrected by its players.", followed on a pending match (not a disputed one, which is already disputed) by "If the score is wrong, dispute the match instead." Neither reason names the Organizer.
5. `correctMatch` and the form keep mapping a 404 to the organizer message (`ORGANIZER_ONLY_MESSAGE` and the record-form copy) as a fallback. Their tests still pass unchanged.
6. The "Disputed" popover text depends on the match. With no Event (a Club only, or neither): a dispute ends when every player who disputed withdraws, and the text has no "organizer". With an Event: the players withdraw, or the event's organizer settles it. Both end with the void after a set time.
7. The Vouch popover text is unchanged: the holds list only gives a hold to a viewer who may vouch (a player in a match with no Event, or an organizer member who played in no match of it), so the existing two texts are already true.
8. The copy rules in `status.test.ts` hold for every new string: no em dash, no "moderator", no "OPEN rating", no digits in the dispute copy, at most two sentences per popover term.
9. Mock fixtures include a made-up Event match and a made-up Club-only match the signed-in mock player played in, both pending or disputed, using the existing made-up Event `E-SEED-0001` "Larkspur Winter League" (Club `GRANTED_CLUB` "Juniper Court Club") and Club `UNGRANTED_CLUB` "Marshwalk Racquet Club". `matchOut` sends their real `event` and `club`. The mock's `correctMatch` still answers 404 for either.
10. Tests cover an Event match, a Club match and a match with neither, for the mapper, `canCorrect`, `statusInfo`, the match page and the correction page. An e2e test opens the Event match and sees the Event name and no "Correct the score".
11. Match rows on the Matches page do not change (decision below).
12. Comments and docs that say "the app does not read them yet" or "frontend#264 will" are updated to say what the code now does.

## Files that change

All paths are under `app/` unless noted.

- `src/lib/domain/models.ts`: add `MatchEvent`, `MatchClub` types and the two `Match` fields.
- `src/lib/domain/mappers.ts`: `toMatch` maps `event` and `club` (copy `code`, `name`, and `organizer` for the Event; nothing else).
- `src/lib/domain/mappers.test.ts`: cases for an Event, a Club, both and neither.
- Every place that builds a domain `Match` literal in tests or factories: add `event: null, club: null` so `pnpm check` passes (find them with `pnpm check`).
- `src/lib/features/matches/status.ts`:
  - `canCorrect` adds `match.event === null && match.club === null`. Update its doc comment.
  - Split `DISPUTE_ENDS` into `DISPUTE_ENDS` (no Event: players only) and `DISPUTE_ENDS_EVENT` (players or the event's organizer). `statusInfo` picks by `match.event`.
  - The vouch text stays as it is (criterion 7). An earlier `VOUCH_MEANS_EVENT` was removed: no viewer could ever see it.
  - Replace the stale comments above `DISPUTE_ENDS` and `CORRECT_EVENT_NOTE`. Either use `CORRECT_EVENT_NOTE` in the correction page (criterion 4) or remove it if nothing uses it. Don't keep an unused export.
- `src/lib/features/matches/index.ts`: export the new strings, update the module doc (lines about Correct and frontend#264).
- `src/lib/features/matches/status.test.ts`: tests for criteria 3, 6, 7, 8. Extend the copy rule tests to the new strings.
- `src/lib/features/matches/components/match-view.svelte`: Event and Club rows in the Details `<dl>`, in the same style as the existing rows.
- `src/lib/features/matches/components/match-view.svelte.test.ts`: Event, Club, neither (criteria 2 and 3).
- `src/lib/features/matches/components/status-panel.svelte.test.ts`: the Disputed popover for an Event match and a match without one. Keep the existing `DISPUTE_ENDS` test valid for a match with no Event.
- `src/lib/features/matches/components/correct-view.svelte` and its `.svelte.test.ts`: the two reasons in `blocked()` (criterion 4), checked before the private-player reason.
- `src/lib/mocks/store.ts`: replace `MockMatch.event?: boolean` with `event?: MatchEventOut` and `club?: MatchClubOut` (or fixture keys that resolve to them). `matchOut` sends them, null when unset. `correctMatch` answers 404 when either is set. Update the comments.
- `src/lib/mocks/fixtures.ts`: the two new fixture matches (criterion 9), with made-up players already in the fixtures.
- `src/lib/mocks/fixtures.test.ts`: replace "sends every match with no event and no club" with tests that the two fixtures send their Event and Club and every other match sends null.
- Tests or e2e specs that count fixture matches (Home's In progress counts, Matches list lengths, needs-action counts) and change because of the new fixtures: update the expected numbers. These are not frozen tests.
- `e2e/matches.spec.ts`: the Event match test (criterion 10) in the `corrections` describe or next to it.
- `plans/frontend-v1-2/plan.md` (repo root): no change needed unless a line there becomes false; Phase 8 decides.

## Order of work

1. Domain type and mapper, with mapper tests (red, then green). Fix every `Match` literal `pnpm check` reports.
2. `canCorrect` and its tests.
3. Dispute and vouch copy in `status.ts`, `statusInfo`, and tests, including the copy rules.
4. Mock store and fixtures, then `fixtures.test.ts`. Update count-based tests the new fixtures move.
5. Match page Details rows and component tests.
6. Correction page reasons and tests.
7. e2e test.
8. Comments and module docs (criterion 12).
9. Full gate, then the live drive.

## Risks

- New fixtures shift counts in unit and e2e tests (Home's In progress, Matches lists, needs-action). Riskiest step: step 4. Run the full test suite and `pnpm e2e` after it, not only the new tests.
- `canCorrect` is also used by `correct-view.svelte`'s `blocked()`. Without the new reasons first, an Event match would show the private-player sentence, which is false.
- The existing popover test uses `DISPUTE_ENDS`. Its fixture match must have no Event, or it should use the matching constant.
- Two-sentence cap per popover term: the Event dispute copy must stay at two sentences.
- Not done on purpose: no Event name on match rows (criterion 11), no link to an Event page (players have none), no Organizer name or code shown, no "Report this organizer" (#220).

## Decisions

- **Match rows stay as they are.** The top line already holds the date, format, games and one badge, and a second item wraps the date on a phone (the comment in `match-row.svelte`). The note line is for status notes. An Event name would crowd either, so it shows on the match page only.
- **A dispute on a Club-only match is settled by its players.** ADR 0034: a legacy club-only match has no Organizer level. So it gets the no-Event dispute copy. Nobody vouches for a held Club-only match: the holds list never lists one, and a hold against it ends only when a match is voided or the hold period ends (the `list_my_holds` and `vouch_for_match` contract). It still can't be corrected by a player (the backend answers 404 for a match with a Club).
- **The frontend can't tell whether an Event's Organizer is still verified.** The Event copy says the organizer can settle it, which is the normal case. The backend decides.
- **Keep the 404 fallback.** `correctMatch` still maps a 404 to the organizer message, as the issue asks.
- **Two correction reasons, two constants.** `CORRECT_EVENT_NOTE` now reads "Only the event's organizer can change a match played at an event." and the new `CORRECT_CLUB_NOTE` gives the Club-only reason, with `CORRECT_CLUB_DISPUTE` after it on a pending match. The first wording ("Players can only correct a match they recorded themselves") was false: any player in a match may correct it, whoever recorded it. `correct-view.svelte` uses both, so neither is an unused export.
- **Both new fixtures are disputed by another player.** The Proof needs the Disputed popover on each. The Event match (`EVENT_MATCH`, 2026-11-04) is Tamsin and Rosa against Oren and Nell, disputed by Nell. The Club-only match (`CLUB_MATCH`, 2026-11-02) is Tamsin against Idris, disputed by Idris. Neither needs Tamsin, so Home's Needs you stays at three. Her match total goes from 26 to 28 and the disputed count from 2 to 4. `fixtures.ts` exports the two codes for the tests.
- **Tests that picked "the other disputed match" now pick Tamsin's own dispute by its decisions** (`services.test.ts`, `e2e/matches.spec.ts`), since the new fixtures come first in the array. The mock integration test for the correction 404 now uses the two fixtures instead of setting a flag (`integration.test.ts`, not listed under Files above).

## Proof

- Criterion 1: `mappers.test.ts`.
- Criteria 3, 6, 7, 8: `status.test.ts`.
- Criterion 2 and the hidden Correct link: `match-view.svelte.test.ts`.
- Criterion 4: `correct-view.svelte.test.ts`.
- Criterion 5: `record-match/service.test.ts` and `record-match/form.svelte.test.ts`, unchanged and green.
- Criterion 9: `fixtures.test.ts`.
- Criterion 10: the above plus the e2e test.
- Live drive (High: changed path plus edge paths), with `PUBLIC_API_MOCK=all pnpm dev`: open the Event match (Event and Club rows, no Correct, the Disputed popover names the organizer), the Club-only match (Club row, no Correct, the popover has no organizer), a match with neither (no rows, Correct offered). Open `/matches/<event code>/correct` and `/matches/<club code>/correct` directly and see the reasons. Check both themes.

Measured on `origin/main` (cbad3b1), for the "phrase absent" test in criterion 6: `grep -n "DISPUTE_ENDS =" -A1 app/src/lib/features/matches/status.ts` shows today's one string, used for every disputed match, contains "the event's organizer settles it". So the no-Event text must be a new string; the test that it has no "organizer" fails on main by construction.
