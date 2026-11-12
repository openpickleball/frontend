# Teaser brand and content

**Status:** done

## Goal

Replace the placeholder teaser in `site/` with a real page for OPEN, an open source rating system for pickleball, served at openpb.org. The page is monochrome and nearly wordless: one striking image, the wordmark, one line and links to follow along. The colors and fonts live in one `@theme` block that the app inherits later through `plans/app-migration/`.

## Steps

- [x] Pick a design direction.
- [x] Confirm the headline.
- [x] Confirm whether the follow row sits under the headline or in the footer.
- [x] Pick the icon: the wordmark's O with two tapered spin swooshes at opposite corners.
- [x] Add the icon as the favicon, on a black tile so it shows on light browser tabs, and beside the full name in the footer. Thicken the swooshes slightly for the favicon so they hold at 16px.
- [x] Decide which social accounts to link.
- [x] Decide whether the rendered image ships or is replaced by photography.
- [x] Replace the placeholder tokens in `site/src/input.css` using the token names below. Self-host the fonts in `site/public/assets/fonts/`.
- [x] Build the page in `site/public/index.html` and add the image at a size suited to phones as well as desktops.
- [x] Update the page title, description and social preview image. Restyle `404.html` and replace the favicon.
- [x] Check phone width, keyboard focus and text contrast over the image. The footer's left side sits on dark and its right side on light grey, so the follow link uses black text on wide screens. On phones the image crops differently, so give the footer a solid background there.
- [x] Connect openpb.org. Handled by `plans/consolidate-repos/`: the teaser moved into `openpickleball/frontend`, whose GitHub Pages serves openpb.org.

Merging changes under `site/` to `main` deploys to production, so the token change and the page should ship together.

## Design direction

Horizon. The mockup is on a private canvas, Round 2 page: https://claude.ai/artifact/RdMveq58e8qynawYqTjHYP

Black and white, one screen tall. An original rendered image of a pickleball's surface rises from black like a planet. The wordmark and headline are centered in the black above it. The footer row has the full name at the bottom left and the follow link at the bottom right. Type is Krona One for the wordmark and Instrument Sans for everything else.

## Tailwind tokens

Tailwind 4 has no config file here. The `@theme` block in `site/src/input.css` is the configuration. With a monochrome page, primary and secondary are black and white, and a small grey ramp handles quieter text:

```css
@theme {
  --color-primary: #000000; /* page background */
  --color-secondary: #ffffff; /* wordmark, headline, links */
  --color-muted: #bdbdbd; /* status line, footer */
  --color-line: #3d3d3d; /* rules and borders, if any */

  --font-display: "Krona One", sans-serif; /* wordmark */
  --font-body: "Instrument Sans", sans-serif;
}
```

Keep a single block so the copy step in `plans/app-migration/plan.md` stays one paste. An accent color can be added later if the app needs one.

## Page copy

The whole page is the wordmark, a headline, the follow row and the full name in the footer.

The promise behind the headline: a pickleball rating that is always free for the player, who can log matches and understand their rating without a paywall. Players span a wide age range, so the wording stays literal and avoids wordplay.

**Headline:** Your pickleball rating, always free.

**Alternatives**

- A pickleball rating that's always free.
- Free pickleball ratings, for every player, for good.
- Log your matches. See your rating. Always free.

**Follow row:** Follow our progress, with a GitHub icon. This link is where players go for status updates. More accounts can join the row later.

**Footer:** The icon and the OPEN wordmark. (It used to spell out Open Pickleball Evaluation Network with bold initials; that was dropped for now.)

The copy deliberately never names DUPR. The contrast works without it and avoids making claims about a specific company.

## Naming note

"Open" is already common in pickleball as a division name and in event names such as the US Open. The page title and social previews should pair it with the full name or openpb.org.

## Decisions

- Round 1 (color-led, longer pages) was set aside in favor of a monochrome, near-wordless page, with specs.com as a reference for restraint rather than something to copy.
- Horizon is the chosen direction for now.
- Copy says plainly what players get, because players span a wide age range. Phrases like "out in the open" were too vague.
- Status updates happen on linked accounts, so the page has no separate status line. GitHub is the only link for now.
- The icon is the wordmark's O with two spin swooshes. It's kept deliberately simple. Net versions were rejected because they looked like tennis rackets.
- The Horizon image follows the hole layout of the Life Time LT Pro 48 (48 holes, per patent application US 2026/0034410), rotated so no hole crosses the horizon. It carries no Life Time branding.
- OPEN is always set in capitals, with wide letter spacing.
- The full name, Open Pickleball Evaluation Network, appears only in the page title, social previews and about copy.
- The follow row sits in the footer, at the bottom right, and the rendered image ships.
- The image is art-directed into three renders of the same scene, with only the framing changed: portrait (below 1:1, 2:5 image, crest at 56%), landscape (1:1 up to 2:1, square image, crest at 44%, and at 16:10 it matches the approved frame) and wide (2:1 and up, 2:1 image, crest at 40%). Each render's aspect ratio is the low end of its range, so wider screens crop only the top and bottom and never the sides. The `object-position` y value equals the crest height, which holds the horizon in place through that crop.
- The hole check uses each hole's real projected outline. In these framings no hole crosses the horizon and none is cut by a side edge. Two holes are near the limb in the rotation (|z| of about 0.16), but they sit fully behind it and outside the frames used.
- The footer sits on the image from 3:2 to 13:5 where the screen allows it (at least 481px tall on the landscape render, any height on the wide render), because that is where sampled contrast holds. Left text is #d4d4d4 up to 37:20 and white above it. Everywhere else the footer is solid black with white text and a short fade above it, so its edge doesn't slice the holes in the shaded part of the ball. On phones it stacks.
- Very wide screens (past about 3:1) can trim the bottom of the center hole. That edge is at the bottom of the page and the footer is solid there.
- The favicon's swooshes are thicker than the footer icon (peak 8.5 instead of 6.8) so they hold at 16px. This is the only difference between the two marks.
- Instrument Sans ships as a variable Latin subset (400 to 700), so bold text is real bold rather than synthesized.
- Absolute URLs in the page head use https://openpb.org/, the custom domain set on GitHub Pages.
