# UX clean-up

**Status:** active

## Goal

The app and site read as one calm system. Krona One marks only the logo. Every app page uses the same heading and section pattern. Screens drop text that repeats their headings and buttons, and the few terms that need explaining get a tap-to-open popover. The match page shows its status in one place. Home becomes a short list of what needs the player, backed by a status filter on Matches.

## Steps

Merged in waves, so that agents working at the same time never edit the same files.

Wave 1

- [x] #280 Keep Krona One for the logo only (app)
- [x] #280 Keep Krona One for the logo only (site), with #281 Drop the numbered kickers and call the nav link About
- [x] #282 Put the Record a match line above each section heading
- [x] #289 Filter the Matches list by status

Wave 2

- [x] #283 Use one heading and section pattern on every app page

Wave 3

- [x] #284 Remove helper text that repeats headings and buttons

Wave 4

- [x] #286 Show match status in one place above the scoreboard
- [x] #287 Trim the match page header and move the match code to the details
- [x] #288 Show each rating format at the same size and move rating history to its own page
- [x] #290 Make Home a short list of what needs you

Wave 5

- [ ] #285 Explain dispute, on hold, vouch and reliability in info popovers

## Heading and section pattern (#283)

Three heading levels:

| Level         | Element                                                  | Style                                    |
| ------------- | -------------------------------------------------------- | ---------------------------------------- |
| Page title    | `h1`                                                     | `page-title`, unchanged                  |
| Section title | `h2`, or the legend of a form section                    | `section-title`: `text-xl font-semibold` |
| Group label   | a heading or label inside a section, such as "Your team" | `text-base font-semibold text-secondary` |

One section pattern: a line above, the title, then the content. `mt-12 border-t border-line pt-4` on the section (`sectionClass`), and `4` from the title to the content.

- `Section` in `app/src/lib/ui/section/` renders the `<section>`, the `h2` and `aria-labelledby`. The heading id is generated unless the page needs a fixed one (`settings-heading`, kept for #276, and `details-heading`). An optional `aside` snippet sits next to the title, for a count or a link.
- Record a match and the correction: each fieldset uses `sectionClass` with a `FieldLegend`, whose legend variant uses `section-title`.
- A list right under a section title drops its own top border. A list in a section drops its bottom border, because the next section's line closes it. `MatchList` takes `underTitle` and `inSection` for these, and the scoreboard drops its bottom border too.
- Home's lists sit right under their titles since #284 removed the intros, so they all take `underTitle`.
- Status panels and alerts stay boxed callouts, not sections.

Where it applies:

- Home: Needs your confirmation, Disputed matches, Matches on hold, Waiting for the other team and Recent matches. Counts and the All matches link are the `aside`.
- Matches: the list has no section title, so nothing changes there. Its list keeps its top border, because no section line sits above it.
- Record a match and the correction: Match, Players, Scoring and Games, then the submit block with the same line and spacing.
- Profile: Your OPEN code, Matches, Ratings, Name and privacy, Your data and Account. Since #288, Rating history is its own page, linked from the Ratings section.
- Match page: Score (the scoreboard) and Details (Games to, Scoring and, since #287, Match code).

## Copy for #285

#284 removed these explanations. #285 can reuse them in the info popovers.

- Needs your confirmation: "Check the score. Confirm it if it's right, or dispute it if it's wrong."
- Disputed: "A player said these scores are wrong. They don't count while they are disputed. Open a match to see how its dispute can end."
- On hold: "Each of these has the same teams and date as another match on OPEN, but other scores. They don't count until each one is vouched for. Open a match to vouch for it." A row outside the on-hold list still says "On hold. It doesn't count yet."
- Waiting for the other team: "Your team confirmed these scores. A match counts once a player on the other team confirms it too."
- Record a match: "Enter the final score. Once it's saved, the other team can confirm it or dispute it." and "This confirms the score for your team. The match stays pending until a player on the other team confirms it too."
- Players: "Type a player's name to find them, or enter their OPEN code. They can find theirs on their Profile page."
- Your OPEN code: "Share it with the people you play. They need it to add you to a match."
- Privacy: "Choose what other signed-in players can see. Your display name is always shown to them."
- Ratings (#288 shortened these in the tiles): "Early estimate: not enough matches yet." is now "Early estimate.", and "It may change when ratings are next recounted." is now "May still change." The reliability popover can carry the longer meaning.

#286 cut the match page's status panel to a title, one sentence and the buttons. These left it. The ones marked with a constant are still exported from `app/src/lib/features/matches/status.ts`.

- How a dispute ends (`DISPUTE_ENDS`): "A dispute ends when every player who disputed the score withdraws. For a match played at an event, the event's organizer can settle it too. If no one settles it within a set time, the match is voided and doesn't count."
- Disputed: "No one can confirm it while it is disputed." and, to the player who disputed, "If the score is right after all, withdraw your dispute. You can't dispute this match again after that."
- Why a match is on hold (`HOLD_WHY`): "Another match on OPEN has the same teams and date as this one, but other scores. Both matches are on hold and don't count until each one is vouched for."
- How a hold ends (`HOLD_ENDS`): "If no one settles the hold within a set time, the newer of the two matches is voided, as long as the older one is confirmed by then."
- Who vouches, before the player's side has: "If this is a separate match, not a repeat of the other one, vouch for it. One player from each team needs to vouch. You can't undo a vouch." For a member of the event's organizer: "If this is a separate match, not a repeat of the other one, vouch for it as a member of the event's organizer. You can't undo a vouch."
- After a vouch: "Your team has vouched for this match. The hold ends once a player on the other team vouches too, and the other match is vouched for." For the organizer: "Your organizer has vouched for this match. The hold ends once the other match is vouched for too."
- What a held match still needs: "The score is confirmed. The match counts once the hold ends.", "Your team hasn't confirmed the score yet. Confirm it if it's right, or dispute it if it's wrong.", "Your team confirmed the score. A player on the other team needs to confirm it too." and "The score also needs a player on each team to confirm it."
- A disputed match on hold: "This match is also on hold. Another match on OPEN has the same teams and date, but other scores."
- Correcting (`CORRECT_NOTE`): "To fix a wrong score, correct it. This match is then voided, and the corrected one counts once a player on the other team confirms it."
- Event matches (`CORRECT_EVENT_NOTE`): "Only the organizer can change a match an organizer recorded, such as one played at an event."
- Voided (`VOIDED_CORRECTED`): "If a player corrected this match, the corrected match is in your match history, with a new code."

## Home (#290)

Home is short by design, whatever the number of pending matches. Top to bottom:

- **Needs you**: the matches where the player has something to do. They confirm (or dispute) a match no one on their team has confirmed, or vouch for a held match their side has not vouched for. Oldest first, by the day played, then by when it was recorded. Each row says its action in its note: "Confirm or dispute the score.", "Vouch for it. It's on hold." or both. It shows 3 rows, then "See all N", which opens the Needs you filter on Matches. The count is the `aside`. With nothing to do it says "You're all caught up."
- **In progress**: one line of counts, each a link to its filter, such as "2 disputed · 2 on hold". It is left out when both are 0.
- **Recent matches**: the 3 newest matches that are not under Needs you, with All matches as the `aside`.
- The code strip with Copy code, then Record a match.
- The Home tab and the side nav's Home item show the Needs you count as a badge when it is above 0. The link's name is "Home, 2 need you" ("Home, 1 needs you" for one).

One list, `needsYou` in `app/src/lib/features/matches/needs-you.svelte.ts`, feeds the badge, Home and the Needs you filter, so the three numbers are always the same. The root layout loads it once the player's code is known. Home and the filter load it again. A confirm or vouch updates the match cache, and the list reads the cache, so the match leaves all three at once.

## Decisions

- #289: the backend has no list of matches waiting for the other team. It lists matches awaiting your confirmation, your disputes and your holds. So the Matches filter leaves out "Waiting for the other team" until the backend offers it.
- #280 (app): the `label` utility is Instrument Sans semibold (600), so the 11px caps stay as easy to read as they were in the heavier Krona One.
- #280 (app): OPEN codes use Instrument Sans medium, not semibold, because the same style applies to names typed into the code input.
- #280 (app): the code style is one utility, `open-code` in `app/src/routes/layout.css`, because it repeats in 8 places.
- #289 (since replaced by #290): "Needs you" on Matches was the awaiting-confirmation list only, and held matches the player could still vouch for were only under "On hold".
- #290: "Needs you" on Matches, on Home and on the nav badge is one list: the matches to confirm and the held matches the player's side has not vouched for. The backend has no combined list and no filter for unvouched holds, so the app reads `GET me/matches/awaiting-confirmation` and `GET me/matches/holds` in full (pages of 100, at most 10 pages each) and merges and sorts them in the browser. Both lists are short by nature. Sorting and merging is display logic, not rating computation. A backend "needs you" list would replace this.
- #290: "On hold" on Matches still lists every hold the player may vouch for, also the ones their side has vouched for, paged by the backend. So a hold the player still has to vouch for is under both Needs you and On hold.
- #290: In progress counts what the filter it links to shows: every disputed match (also one the player can withdraw, since withdrawing is optional) and every hold. A hold to vouch for is counted under Needs you and under "on hold", because it is both.
- #290: In progress has no "waiting" count. The backend has no list of matches waiting for the other team, so there is no filter to link to, and the newest page of the history can't give a true total. Recent matches still say "Waiting for the other team." on such a row.
- #290: Home's order follows the issue: Needs you first, then In progress, Recent matches, the code strip and Record a match. The Record tab stays one tap away. When the player has no matches, the empty state keeps its own Record a match button and the second one is left out.
- #290: the nav badge is our own small component (`nav-badge.svelte`). shadcn-svelte's sidebar menu badge would overwrite our restyled sidebar parts, and the status Badge is an outlined pill with a dot. The badge is hidden from screen readers. The link's name comes from hidden text, not an `aria-label`, because axe then counts the badge digit as visible text the name must contain.
- #290: Home's "Matches on hold", "Disputed matches" and "Waiting for the other team" sections are gone, so the `waiting` row list from #284 is gone too.
- #289: the filter is the native select from `#lib/ui/native-select`, in the address as `?show=` (`needs-you`, `disputed`, `on-hold`). An unknown value shows All. Choosing a filter goes to its first page and keeps focus on the select. The segmented control from Record a match is a radio group inside that feature, so it could not be shared without moving it.
- #289: Home's "N more ..." links now go to the matching filter, with the text "See them all".
- #283: the `label` utility stays, for kickers and captions only: the format and date above the match page and correction titles, and "Your OPEN code" in Home's code strip. None of them is a heading.
- #283: the match page gets two visible section titles, Score and Details, so every block below the header follows the pattern. #287 moves the match code into Details.
- #283: the Ratings and Rating history blocks on Profile use `Section` instead of the shadcn Card, which is meant for boxed panels. Card stays for the auth forms.
- #283: "Finish your player profile", shown when a player has to give their details again, is a `Section` too.
- #283: empty states keep their own centered title. They stand in for a page's content, not a section of it.
- #289 (since replaced by #284): a filter shows only the count line ("2 matches, newest first."), with no explanation sentence. #284 removes helper text and #285 moves the disputed and on-hold explanations into info popovers. The empty states stay.
- #284: Matches has no count line. The paging range ("1–20 of 26") already gives the count, for every filter.
- #284: a row note leaves out what its list title says. `MatchList` and `MatchRow` take `listOf` (`needs-you`, `disputed`, `on-hold` or `waiting`), set by Home's sections and by a Matches filter. Under Needs your confirmation the row has no note. Under Matches on hold it says only "Your team has vouched for it." when that is true. Under Waiting for the other team it says only "You confirmed this score." or "Your team confirmed this score." "You disputed this score." stays everywhere. In All and Recent matches the notes are unchanged.
- #284: "Other signed-in players see your confirmed matches." is a second line on the Match history switch, shown while it is on. Matches no longer reads the settings or links to them. The `settings-heading` id stays, for the move to Settings in #276.
- #284: the correction page keeps its intro and its Players note (a correction keeps the same players), which the issue did not list. The warning under Save the correction is two sentences: it voids the match with a new match code, and it confirms the score for your team.
- #284: the demonstration sentence on Ratings is already one sentence and stays as it is.
- #288: the Ratings section shows one tile per format, the same size, in a Tailwind grid: two columns on a phone, three from `sm`. Each tile has the format, the number (Instrument Sans semibold, tabular), its reliability lines and the Demonstration badge. The headline logic (`headlineRating`) is gone. The demonstration sentence stays above the tiles.
- #288: rating history is its own page at `/profile/ratings` (`ROUTES.ratingHistory`), linked from the Ratings section's `aside` ("Rating history", like Home's "All matches"). It has a back link to Profile, like the match page's back link to Matches, then the page title. It has no intro line under the title, because "Every change to your ratings, newest first." restated the title, and the paging range shows the order. Its list keeps its top border, as the Matches list does, because no section line sits above it.
- #288: the history page keeps 5 changes a page, as on Profile before. It reads the same endpoint for the player's own code, so the `rating_history_visibility` setting applies as before: the player always sees their own, and a 404 reads "There is no rating history to show." The guard covers the page, because it is under `/profile`.
- #288: the Rating history link shows whatever the Ratings section shows (loading, no ratings yet, failed), because the history page has its own empty and error states.
- #286: the panel's edge has a fourth, plain state (the panel's own line color) for a match with nothing to do and no problem: waiting for the other team, waiting for confirmation, voided, and a confirmed match the panel still shows. Neutral (the text color) means the player has a step to take. Disputed wins over on hold, since a disputed match doesn't count either way.
- #286: on hold uses a new `warning` token, `light-dark(#b45309, #fbbf24)` (Tailwind's amber-700 and amber-400), in `app/src/routes/layout.css`. There was no warning color. It is used only for the edge, which is not the only signal: the panel title and the On hold badge say it.
- #286: a confirmed match drops the panel unless it is on hold, the player just recorded or corrected it, or an action left an error to show. Focus after an action goes to the panel heading, or to the page title (`match-title`) when the panel has gone, for example after the last confirm or vouch.
- #286: the one-visit lines "You just recorded this match." and "You just corrected this match, so it has a new code and the old match is voided." stay in the panel above its sentence. They are not explanations, and they show once.
- #286: a held match keeps the buttons its status needs, such as Confirm and Dispute, under the On hold title, with no extra line about them.
- #287: the match page title is the format and the short date, "Doubles · Sat 14 Nov", with no year, like the list rows. The tab reads "Doubles, 14 Nov · OPEN Pickleball", keeping the site name every other tab has. Until the match loads, the tab reads "Match · OPEN Pickleball".
- #287: the `label` kicker is gone from the match page. The correction page keeps its own, since #287 covers only the match page.
- #287: the match code sits in Details under Games to and Scoring on a phone, and beside them from `lg`. Its Copy button is the small outline button with the visible text "Copy" and the name "Copy match code".
- #287: without the sentence headline, the scoreboard starts with a sentence for screen readers only, such as "You and Oren Quill beat Bea Marlowe and Kit Ashdown, 11-7, 9-11, 11-4.", before its table. The table alone named the winners but not the result in words.
