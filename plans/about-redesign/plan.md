# About page in the teaser's design language, with the new logo

**Status:** done

## Goal

The about content uses the same design system as the teaser (black and white, Krona One for the wordmark and labels, Instrument Sans for everything else, the `@theme` tokens in `site/src/input.css`) and carries the new OPEN logo. The pine and optic-yellow look and the court-and-ball emblem retire. The about content lives on the home page, below the teaser, and scrolling down transitions into it.

## Steps

- [x] Prototype the about page in the teaser's style: `design/about.html`.
- [x] Explore logo directions: `design/marks.html`, `design/icon.html`, `design/icon-5.html`, `design/icon-c.html`.
- [x] Pick the logo: C, Balanced (see Decisions).
- [x] Export it as static SVGs: `design/assets/mark.svg` and `design/assets/favicon.svg`.
- [x] Rebuild the about content from the prototype on the Tailwind build, below the teaser in `site/public/index.html`, and remove `site/public/about/` with its `styles.css`, Archivo font and pine assets. `/about/` now redirects to `/#about`.
- [x] Add the scroll transition from the teaser into the about sections.
- [x] Switch the site to the new logo: `mark.svg`, `favicon.svg`, `favicon-48.png`, `apple-touch-icon.png`.
- [x] Logo round 3, after UTR's mark: a solid ball whose holes do the work. `design/icon-u.html`: indoor-ball hole patterns, flat and on a sphere.
- [x] Logo round 4: the indoor ball inside the spin marks, `design/icon-d.html`. Pick D1 and switch the site's four logo files to it.
- [ ] Carry it into `app/` through `plans/app-migration/`.

`design/` holds prototypes only. It is not under `site/public/`, so nothing in it deploys.

The finished prototypes (`design/about.html`, `icon.html`, `icon-5.html`, `icon-c.html` and `icon-u.html`) and the pre-merge `logos/` folder were removed once this round was done. They are in git history.

## Follow-ups

This round is done, but more changes to the logo and to the about and information content are likely. Pick them up here, or start a new plan if they grow into their own project.

## Decisions

- **Logo: D1, Segmented spin** (replaces C below). An indoor pickleball inside the spin marks. The ball is the 26-hole indoor layout (a pole, a ring of 6, a band of 12, a ring of 6, a pole) projected on a sphere and seen straight down the pole, so the front shows a centre hole and six ovals; holes are 15° across. The spin marks are redrawn to follow a circle instead of the Krona O: from -78° to -12° and its 180° twin, tapering from a point to a flat end, in the same three segments (0.30 : 0.27 : 0.29, gaps 0.065), 9.5 thick at the end and 4.5 off the ball. Chosen over a solid swoosh, round gaps between segments and a tilted ball. Inspired by UTR's mark: one solid ball that is obviously the ball.
- **Favicon (D1):** the same mark on the black rounded tile at 85%, with marks 1.2× thick, 1.15× the gap and segment gaps 0.09. `apple-touch-icon.png` is the same tile without the rounded corners.
- **The green O is parked.** Round 3 tried a larger pickleball-green ring on one of the holes as the O for Open. Its variants (a ring on an offset hole, a centre ring, a U-shaped seam of holes ending in the ring) were dropped from `design/icon-u.html` before it was committed, so they live only in this note.
- **Logo before D1: C, Balanced.** The Krona One O with the two spin marks, where each spin mark is split into three segments with even gaps (lengths 0.30 : 0.27 : 0.29 of the arc, gaps 0.065). The O is scaled to 90% about its center. The segments keep the measured path of today's swooshes and the same gap to the O, and are 1.5× as thick. Chosen over pickleball-hole variants (holes in the O, round gaps) because it stayed the most refined; the pickleball itself is carried by the horizon image instead.
- **Favicon:** the same mark on the black rounded tile, with segments 1.75× thick and gaps 0.09 so they stay visible at 16 px. Same approach as the current favicon, which thickens its swooshes.
- **Statistics in the brand** live in supporting graphics rather than the logo: the 2.0 to 8.0 rating ruler, the calibration chart and the rating badge in `design/marks.html`.
- `design/tools/export-logo.py` generates `design/assets/mark.svg` and `favicon.svg` for D1 from parameters alone. Copy them to `site/public/assets/img/`, then render `favicon-48.png` (48 px, transparent corners) and `apple-touch-icon.png` (180 px, square black tile) from `favicon.svg` in a browser. The C exporter and its `mark-v1.svg` outline are in git history.
- **One page, not two.** The about content sits under the teaser on `/`. Scrolling past the teaser lifts the wordmark away while the ball sinks and dims into the black, and the about sections fade up as they arrive, using CSS scroll-driven animations. "Learn more" glides there over 1.2 s so the same transition plays. Without scroll-driven animation support, or with reduced motion, the page is the same without the movement.
- **Two more grey tokens:** `--color-faint` (#8a8a8a) for captions and fine print, `--color-surface` (#0d0d0d) for raised panels. Also `--spacing-gutter` for the page side padding.
- **The teaser footer moved to the end of the page**, so the `footer-on-image` and `footer-bright` variants are gone.
- **`og.jpg` stays** for now. It shows the wordmark and the ball, not the mark, so the logo change doesn't affect it.
- **The teaser shows the logo beside OPEN.** Two other versions were tried and dropped: the logo as the O in OPEN, and the full name under the wordmark.
