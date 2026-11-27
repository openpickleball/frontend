# UX clean-up

**Status:** active

## Goal

The app and site read as one calm system. Krona One marks only the logo. Every app page uses the same heading and section pattern. Screens drop text that repeats their headings and buttons, and the few terms that need explaining get a tap-to-open popover. The match page shows its status in one place. Home becomes a short list of what needs the player, backed by a status filter on Matches.

## Steps

Merged in waves, so that agents working at the same time never edit the same files.

Wave 1
- [ ] #280 Keep Krona One for the logo only (app)
- [ ] #280 Keep Krona One for the logo only (site), with #281 Drop the numbered kickers and call the nav link About
- [x] #282 Put the Record a match line above each section heading
- [ ] #289 Filter the Matches list by status

Wave 2
- [ ] #283 Use one heading and section pattern on every app page

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

To be filled in by #283.

## Home (#290)

To be filled in by #290.

## Decisions

- #289: the backend has no list of matches waiting for the other team. It lists matches awaiting your confirmation, your disputes and your holds. So the Matches filter leaves out "Waiting for the other team" until the backend offers it.
