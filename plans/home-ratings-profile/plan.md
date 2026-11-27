# Home, Ratings and Profile

**Status:** active

## Goal

A player opens the app to see their code, their ratings and what is happening with their matches. Home shows those three, top to bottom. Ratings is a tab of its own, with the tiles and the full history. Profile is the settings page: the code on one line, then the settings. The player's numbers no longer sit between settings, and every pending match ends up in one list on Home.

## Steps

- [x] #307 Move the code and ratings to Home, add a Ratings tab, and make Profile the settings page
- [ ] #271 Turn Profile into the settings groups (Account, Privacy, Your data, Help and about, Sign out) with Item rows
- [ ] #276 Move the privacy switches into Profile > Privacy and add the name, search and age choices with their backend support
- [ ] #305 One Home list of every pending match, those needing the player first. Blocked by openpickleball/backend#338, which adds the list of matches waiting for the other team.

## Decisions

- #307: Home is the code strip with Copy code, then Ratings, then In progress. Recent matches and the Record a match button are gone from Home. Record stays in the nav, and the empty state for a player with no matches keeps its own Record a match button.
- #307: until #305 lands, In progress holds what Home had: the Needs you list (3 rows, then "See all N") and the counts line ("4 disputed · 2 on hold"), with the info popover after the title. Needs you is a group label (`h3`, `text-base font-semibold text-secondary`) inside the section, not a section of its own, and no longer shows its own count: its rows, or "See all N", give it, and the nav badge says it too.
- #307: the `aside` of In progress is the player's match count, "28 matches", linking to Matches. It replaces "All matches" and Profile's Matches section. It reads the count of the same history page Home already loads, so it costs no extra request. `countMatches` in `features/matches` has no caller left in the app, but stays with its tests.
- #307: the code, the ratings and the matches load on their own. If the match history fails, its error stands where In progress would be, below the code and the ratings.
- #307: the code strip moved from `features/matches` to `features/players` (`CodeStrip`), because Home and Profile both use it. It has a line above, like a section, and none below, because the Ratings or Name and privacy line follows 12 below. Profile's code card is gone, and with it the Share button. The issue asks for the code with Copy, and Share only ever showed on devices with a share sheet.
- #307: Profile has no name line under the title. The display name field shows the name.
- #307: Profile's sections are Name and privacy, Two-factor authentication (the Security group from #301), Your data, then Account. "Your data" is its own component (`YourData`), so the route can put two-factor before it. The two-factor section keeps its title.
- #307: the Ratings tab is `/ratings` (`ROUTES.ratings`), between Matches and Profile, with the Lucide `chart-line` icon. Its page title is "Ratings", then "Current ratings" (the tiles) and "Rating history" (the list from #288, 5 to a page). It has no back link, since it is a tab. The history list drops its top border, because it sits right under its section title.
- #307: on the Ratings tab the demonstration sentence is a boxed notice (`Alert`, default variant, with the `info` icon and the title "Demonstration numbers"), not a plain line, because a tab of its own makes the numbers look more official. Every tile and history row keeps its Demonstration badge. Home keeps the plain sentence. The notice shows when the ratings are demonstration ones, as the sentence did.
- #307: `RatingsCard` takes `title`, `details` (the "Details" link to Ratings, on Home) and `prominent` (the boxed notice, on Ratings). The reliability popover from #285 is on both.
- #307: `/profile/ratings` redirects to `/ratings` with a 308 from its `+page.ts`. Signed out, the guard sends the player to sign in first. `/ratings` is a guarded page.
- #307: `ProfileStats` became `MyRatings`, which loads only the current ratings, for Home and the Ratings tab. `HomeView` takes it as an optional prop, so its tests pass a stand-in without importing another feature's services.
- #307: five tabs fit a 320px phone: each label on one line, each tab at least 44px wide and tall, and Home's badge inside its tab. An e2e test checks this at 320 and 375. An organizer member has six (Events before Profile, `grid-cols-6`). At 320px those six still fit on one line each, about 53px a tab, with the labels close together.
- #307: at 320px the rating tiles are tight. A long Demonstration badge or "Reliability from an external rating" line can reach the tile's edge. This was already so on Profile since #288, and is left for a follow-up.
