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

- [ ] #284 Remove helper text that repeats headings and buttons

Wave 4

- [ ] #286 Show match status in one place above the scoreboard
- [ ] #287 Trim the match page header and move the match code to the details
- [ ] #288 Show each rating format at the same size and move rating history to its own page
- [ ] #290 Make Home a short list of what needs you

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

- `Section` in `app/src/lib/ui/section/` renders the `<section>`, the `h2` and `aria-labelledby`. The heading id is generated unless the page needs a fixed one (`settings-heading`, which Matches links to, and `details-heading`). An optional `aside` snippet sits next to the title, for a count or a link.
- Record a match and the correction: each fieldset uses `sectionClass` with a `FieldLegend`, whose legend variant uses `section-title`.
- A list right under a section title drops its own top border. A list in a section drops its bottom border, because the next section's line closes it. `MatchList` takes `underTitle` and `inSection` for these, and the scoreboard drops its bottom border too.
- When #284 removes the Home intros, the lists there will sit right under their titles and should take `underTitle`.
- Status panels and alerts stay boxed callouts, not sections.

Where it applies:

- Home: Needs your confirmation, Disputed matches, Matches on hold, Waiting for the other team and Recent matches. Counts and the All matches link are the `aside`.
- Matches: the list has no section title, so nothing changes there. Its list keeps its top border, because no section line sits above it.
- Record a match and the correction: Match, Players, Scoring and Games, then the submit block with the same line and spacing.
- Profile: Your OPEN code, Matches, Ratings, Rating history, Name and privacy, Your data and Account.
- Match page: Score (the scoreboard) and Details (Games to, Scoring).

## Home (#290)

To be filled in by #290.

## Decisions

- #289: the backend has no list of matches waiting for the other team. It lists matches awaiting your confirmation, your disputes and your holds. So the Matches filter leaves out "Waiting for the other team" until the backend offers it.
- #280 (app): the `label` utility is Instrument Sans semibold (600), so the 11px caps stay as easy to read as they were in the heavier Krona One.
- #280 (app): OPEN codes use Instrument Sans medium, not semibold, because the same style applies to names typed into the code input.
- #280 (app): the code style is one utility, `open-code` in `app/src/routes/layout.css`, because it repeats in 8 places.
- #289: "Needs you" on Matches is the awaiting-confirmation list only. Held matches the player can still vouch for are under "On hold". The two are separate backend lists with their own paging, and merging them into one paged list would mean reading both in full. #290 can revisit this if Home's "Needs you" takes in vouching.
- #289: the filter is the native select from `#lib/ui/native-select`, in the address as `?show=` (`needs-you`, `disputed`, `on-hold`). An unknown value shows All. Choosing a filter goes to its first page and keeps focus on the select. The segmented control from Record a match is a radio group inside that feature, so it could not be shared without moving it.
- #289: Home's "N more ..." links now go to the matching filter, with the text "See them all".
- #283: the `label` utility stays, for kickers and captions only: the format and date above the match page and correction titles, and "Your OPEN code" in Home's code strip. None of them is a heading.
- #283: the match page gets two visible section titles, Score and Details, so every block below the header follows the pattern. #287 moves the match code into Details.
- #283: the Ratings and Rating history blocks on Profile use `Section` instead of the shadcn Card, which is meant for boxed panels. Card stays for the auth forms.
- #283: "Finish your player profile", shown when a player has to give their details again, is a `Section` too.
- #283: empty states keep their own centered title. They stand in for a page's content, not a section of it.
- #289: a filter shows only the count line ("2 matches, newest first."), with no explanation sentence. #284 removes helper text and #285 moves the disputed and on-hold explanations into info popovers. The empty states stay.
