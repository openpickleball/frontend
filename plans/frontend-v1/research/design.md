# Design language audit

Paths are relative to the frontend repo root. `css:N` = `site/src/input.css`, `idx:N` = `site/public/index.html`.

## Summary

1. One design language, confirmed. `/` is the whole site (teaser plus `#about` and `#help`). `/about/` is only a redirect stub (`site/public/about/index.html`), so there is nothing left to disagree with. The old pine/optic-yellow/Archivo look is fully gone from `site/`.
2. The tokens live in one `@theme` block (`css:24-36`) written with `light-dark()`. It pastes straight into `app/src/routes/layout.css`. The theme switch is `data-theme` on `<html>` plus a `light:` custom variant (`css:50-59`), and the app has to port it.
3. The system is not fully captured in `@theme`. These are still hardcoded: the pickleball green in the `#ball-green` SVG filter (`idx:125-132`), the theme-color metas, the hero `brightness(0.15)` dim, and the section spacing clamps. They should become tokens in the app.
4. `plans/consolidate-repos/plan.md` is stale: it still says "two pages keep their own design languages" and lists `about/` as a live page with its own CSS. `app/` is untouched `sv create` boilerplate, and its favicon is the retired logo.
5. `brand-assets` is an empty git repo (no commits), so it has nothing to use. `open-ui` is archived and fully older than `frontend` (last commit 2026-11-10); nothing in it is newer or missing here. No real personal data was found in `site/` or `app/`. The only contact is `info@openpb.org`, a role address.

---

## 1. Design tokens in use

### 1.1 Colors (`@theme`, `css:25-30`; each is `light-dark(ivory, black)`)

| Token | Ivory (light) | Black (dark) | Role | Contrast on bg (light / dark) |
|---|---|---|---|---|
| `--color-primary` | `#f7f3e8` | `#000000` | page background; text on solid buttons | n/a |
| `--color-secondary` | `#17150f` | `#ffffff` | wordmark, headlines, links, solid button fill | 16.5 / 21.0 |
| `--color-muted` | `#4d493f` | `#bdbdbd` | body copy, nav, footer, labels, shimmer base | 8.1 / 11.2 |
| `--color-faint` | `#6c6658` | `#8a8a8a` | captions, legal line | 5.2 / 6.1 |
| `--color-line` | `#d8d1bf` | `#3d3d3d` | rules and borders (`border-t border-line`), social button borders | 1.4 / 1.9 (decorative only) |
| `--color-surface` | `#fcfaf3` | `#0d0d0d` | raised panels. Defined but unused on the site. | n/a |

Hardcoded colors that sit outside `@theme`:

| Value | Where | Role | Action in app |
|---|---|---|---|
| `#f7f3e8` / `#000000` | `idx:9, 8, 26, 56`; `404.html:8-9`; `404.html` script | `<meta name="theme-color">` and the JS that updates it | derive from tokens, or keep a small constants file |
| `#0a0c05` to `#bad446` gradient (tables `0.039,0.176,0.314,0.451,0.588,0.729` / `0.047…0.831` / `0.020…0.275`) | `idx:128-130` | pickleball green, the ivory-theme hero ball | add `--color-ball-green` (about `#bad446`) and `--color-ball-shade` (about `#0a0c05`) |
| `brightness(0.15)` dark, `opacity(0.15)` ivory | `css:219-222` | dim the ball while scrolling away | motion token |
| `#000` / `#fff` / `sans-serif` inline | `site/public/about/index.html:16` | redirect stub only | delete the page, or leave it |
| `#c8e64b`, `#c8f23c` (lime) | `design/content-v2.html:20,61`, `design/icon-d.html:57,70` | prototype accent that never shipped | do not carry over |

No accent color is shipped. The only green on the site is the ball in the ivory theme.

### 1.2 Typography

| Role | Family / token | Weight | Size | Line height / tracking | Source |
|---|---|---|---|---|---|
| Wordmark (hero) | Krona One, `--font-display` | 400 | `clamp(42px, 5.6vw, 80px)` | `leading-none`, `tracking-[0.1em]`, `-mr-[0.1em]` to cancel the trailing space | `idx:229` |
| Wordmark (header) | Krona One | 400 | 17px | same | `idx:92` |
| Wordmark (footer) | Krona One | 400 | 14px (`text-sm`, inherited) | same | `idx:303` |
| Wordmark (404) | Krona One | 400 | `clamp(42px, 5.6vw, 80px)` | same | `404.html:37` |
| Label / kicker (`label` utility) | Krona One | 400 | 11px, uppercase | `letter-spacing: 0.14em`, color `muted` | `css:161-167` |
| Hero headline (h1) | Instrument Sans, `--font-body` | 400 | `clamp(20px, 1.7vw, 24px)` | `leading-[1.3]`, `text-balance`, `mt-7` | `idx:232` |
| "Learn more" | Instrument Sans | 400 | 15px | `tracking-[0.02em]`, shimmer | `idx:238` |
| Section h2 | Instrument Sans | 500 (`font-medium`) | `clamp(30px, 3.6vw, 48px)` | `leading-[1.08]`, `tracking-[-0.015em]`, `max-w-[20ch]`, `text-balance` | `idx:250, 278` |
| Section lead | Instrument Sans | 400, `muted` | `clamp(17px, 1.5vw, 20px)` (about) / `clamp(17px, 1.4vw, 19px)` (help) | `leading-normal`, `text-pretty`, `max-w-[54ch]` / `[56ch]` | `idx:254, 281` |
| Pillar h3 | Instrument Sans | 600 | 19px | default | `idx:260, 264, 268` |
| Pillar body | Instrument Sans | 400, `muted` | 16px | `leading-normal` | `idx:261` |
| Button | Instrument Sans | 600 | 16px (`text-base`) | pill, `px-7 py-3.5` | `idx:291` |
| Nav links | Instrument Sans | 400 | 14px (`text-sm`) | `tracking-[0.02em]` | `idx:94` |
| Footer text | Instrument Sans | 400 | 14px; legal line 13px (`faint`) | `tracking-[0.02em]`, tagline `leading-[1.6]` | `idx:298, 327` |

Font loading:

- Self-hosted woff2 in `site/public/assets/fonts/`: `krona-one-latin.woff2` (400) and `instrument-sans-latin-var.woff2` (variable, wght 400 to 700). Both are Latin subsets, and the OFL license texts sit next to them.
- `@font-face` is at `css:3-18` with `font-display: swap`. The `url("../fonts/...")` paths are relative to the compiled `assets/css/main.css`.
- `idx:33-46` preloads both files with `crossorigin`. `404.html` does not preload.
- Body is `font-body text-secondary antialiased` (`idx:72`).
- No other families and no italics. Weights in use: 400, 500, 600.
- The app needs `@font-face` URLs that Vite resolves, or files in `static/`. The `@theme` block does not include `--font-*` fallbacks beyond `sans-serif`.

### 1.3 Spacing, layout, radii, shadows

| Token / pattern | Value | Source |
|---|---|---|
| `--spacing-gutter` | `clamp(20px, 4vw, 56px)` | `css:32` |
| `wrap` utility | `margin-inline: auto; max-width: calc(1240px + 2 * gutter); padding-inline: gutter` | `css:154-158` |
| Section vertical padding | about: top `clamp(96px, 13vw, 176px)`, bottom `clamp(72px, 11vw, 148px)`. help: `clamp(72px, 11vw, 148px)` both | `idx:245, 275` |
| Pillars grid | `grid gap-10 md:grid-cols-3`, top margin `clamp(56px, 7vw, 96px)`, cards are `border-t border-line pt-5` | `idx:258-259` |
| Header | fixed, `h-16` (64px), `bg-primary/80 backdrop-blur-md`, `scroll-pt-20` on `<html>` | `idx:2, 87-89` |
| Footer grid | `md:grid-cols-[1.6fr_1fr_1fr]`, `gap-10`, `pt-12 pb-7` | `idx:298-299` |
| Hero grid | rows `43.68fr / 12.32fr / 44fr`; landscape `34.32 / 9.68 / 56`; wide `31.2 / 8.8 / 60`; short-landscape variants | `idx:139` |
| Custom variants | `art-land` (min-aspect 1/1), `art-wide` (min-aspect 2/1), `short` (max-height 480px), `light` | `css:42-59` |
| Radius | only `rounded-full` (CTA pill, social buttons, theme toggle). No other radii. | `idx:108, 291, 311` |
| Shadows | none. Depth comes from `border-t border-line`, `backdrop-blur-md`, and a gradient fade at the hero bottom. | `css:201-211` |
| Icon sizes | logo 26px (header), 24px (footer), 1.25em (hero); toggle 36px target with an 18px icon; social 40px | `idx:91, 302, 230, 108, 311` |
| Focus | `focus-visible:outline-2 outline-offset-4 outline-current` (offset 2 on the toggle, `outline-secondary` on the CTA) | `idx:90` and others |

### 1.4 Motion

| Name | Spec | Reduced motion | Source |
|---|---|---|---|
| `shimmer` ("Learn more") | 100deg gradient `muted 40%, secondary 50%, muted 60%`, `background-size: 250% 100%`, clipped to text, `@keyframes shimmer` moves 100% to 0%, `3.2s ease-in-out infinite`. Hover and focus-visible stop it and show `secondary`. | static `muted` text | `css:116-149` |
| Theme crossfade | `document.startViewTransition`, `::view-transition-old/new(root)` `0.5s ease-in-out` | switches at once | `css:73-78`, `idx:352-358` |
| Scroll-driven hero (needs `@supports (animation-timeline: view())`) | `.hero` is a `view-timeline`. `.hero-copy` fades and rises `-10vh` over `exit 0-45%`. `.hero-art` goes `translate 0 30%`, `scale 1.08`, dim over `exit 0-100%`, origin `50% 100%`. `.hero::after` fades the ball into the page color (gradient `primary 12%` to transparent) over `exit 0-35%`. | all removed | `css:195-255` |
| `reveal` | `opacity 0` and `translate 0 32px` to rest, `linear`, `animation-timeline: view()`, `entry 0-100%` | removed | `css:228-232, 257-262` |
| "Learn more" glide | JS scroll, 1200ms, cubic ease-in-out (`4t^3` then `1 - (-2t+2)^3/2`), then `pushState` and focus the target | jumps | `idx:408-434` |
| Smooth scroll | `motion-safe:scroll-smooth` on `<html>` | off | `idx:2` |
| Header show/hide | `transition-[opacity,translate] duration-300`, shown when `hero.bottom <= 0.4 * innerHeight`, rAF-throttled | `motion-reduce:transition-none` | `idx:87, 378-395` |
| `arrow-link` | `→` appended, `translate: 4px 0` on hover, `0.2s` | none | `css:170-187` |

### 1.5 Dark and light behavior

- Dark (black) is the base look. Light is ivory with near-black text, not white. System preference decides, and the toggle (fixed top right, sun and moon icons) overrides it.
- `:root { color-scheme: light dark }`, with `[data-theme=light|dark]` forcing one (`css:61-71`). Tokens follow through `light-dark()`.
- A `<head>` script reads `localStorage.theme` and sets `data-theme` plus the theme-color metas before first paint (`idx:47-59`; same script in `404.html`).
- The `light:` variant (`css:50-59`) targets ivory whether it comes from `data-theme` or from the media query. There is no `dark:` variant, because dark is the default and `light:` is the exception.
- The ivory theme recolors the hero art. It runs the render through the `#ball-green` gradient map and masks it to a fitted circle per render (`css:95-110`). The mask coordinates were fitted by `design/tools/fit-ball-mask.py`, and the `object-position` classes on the `<img>` must stay in step (`idx:210`).
- `favicon.svg` is an ivory mark on a black tile in both themes. The `mark` utility paints `mark.svg` as a CSS mask in `currentColor` (`css:81-86`).

---

## 2. Voice and visual character

- **Monochrome and quiet.** Black or ivory, one gray ramp, no accent color and no shadows. The single picture is a rendered pickleball rising out of black like a planet, and ivory mode turns that ball green.
- **Wide-tracked caps for identity, plain sans for everything else.** Krona One shows up only in OPEN (tracking 0.1em), the wordmark, and 11px numbered kickers (`01 · What we stand for`). Instrument Sans carries the rest at weights 400 to 600.
- **Literal and honest copy.** Plain words for a wide age range, no wordplay, and "will" rather than "is" for what does not exist yet. It never names competing rating systems and never shows the 2.0-8.0 scale or the rating method, and "Only say what is true today" is a rule in `site/AGENTS.md`.
- **Generous, calm layout.** Large clamp-based whitespace, hairline top rules instead of cards, pill-shaped CTAs, one-column text blocks capped at 54 to 56ch.
- **Motion that reads as physical.** The ball sinks and dims as you scroll, sections rise 32px into place, and "Learn more" shimmers slowly. Every effect has a reduced-motion fallback and the page still works without it.

---

## 3. Consistency check: `/` vs `/about/`

Verdict: one language. `/about/` has no UI of its own anymore (it redirects to `/#about`). Remaining inconsistencies:

| # | Where | Inconsistency | Severity |
|---|---|---|---|
| 1 | `site/public/about/index.html:16` | Hardcoded `#000`, `#fff`, `sans-serif`. No fonts, tokens, theme or favicon. Flashes black for light-theme users before the redirect. Has `noindex`, and a `theme-color` of only `#000000`. | low (stub) |
| 2 | `404.html` vs `index.html` | 404 has no theme toggle, no logo mark (just the text OPEN), no font preload, and no OG metadata. It uses `<base href="/">`. It does follow the tokens and the theme script. | low |
| 3 | `idx:247` vs `idx:277` | Kicker spacing differs. The about heading uses `mt-[22px]`, the help heading `mt-[18px]`. The lead paragraph is `mt-7` vs `mt-5`. | low |
| 4 | `idx:254` vs `idx:281` | Lead copy size and measure differ: `clamp(17px,1.5vw,20px)` and `54ch` vs `clamp(17px,1.4vw,19px)` and `56ch`. | low |
| 5 | `idx:247-254` vs `idx:277-290` | `reveal` is on all of the about elements, but in help it is only on the h2 and the button. The kicker and lead paragraph just appear. | low |
| 6 | `idx:308, 319` | The footer column titles are `<h2>`s styled as kickers, so the document outline has extra h2s after "Get involved". | low (a11y) |
| 7 | `idx:296` | The `font-semibold` CTA has `hover:bg-muted`. In the ivory theme that goes from near-black to mid-gray, the reverse of how links behave (`hover:text-muted`). Same direction as dark, so it is consistent, but it is the only filled control. | info |
| 8 | `@theme` vs reality | `--color-surface` is defined and never used. `--color-faint` is used once. The green and the dimming values are not tokens (see 1.1). | medium for the app |
| 9 | `site/AGENTS.md:3` vs plan | AGENTS says to use color tokens, not hex, but the `theme-color` metas and the JS in `index.html` and `404.html` repeat the hex values by hand. | low |
| 10 | `design/shared.css` vs `@theme` | The prototype stylesheet defines dark-only values and a `--gutter` token instead of `--spacing-gutter`. It uses 16px radii and a lime accent that the shipped site does not have. It is a stale second source of truth. | medium |
| 11 | Source style | `site/` HTML uses 2-space indents. `app/` uses tabs and single quotes (`app/.prettierrc`). Components will need reformatting when ported. | info |

---

## 4. Stale artifacts

| Path | Why it is stale | Suggested action |
|---|---|---|
| `plans/consolidate-repos/plan.md` | Status `active`, and the Goal says the pages "keep their own design languages" and that "Learn more" goes to `/about/`. Steps and decisions describe `about/` as a live page with its own CSS (last decision line), which `plans/about-redesign` removed. 3 admin items are still unchecked (required checks, custom domain, post-deploy check), and the `www.openpb.org` custom domain was already switched to the bare domain in commit `ae39c50` (not done yet: Pages still uses www.openpb.org; see consolidate-repos). | Rewrite the Goal and decisions for one page. Verify the open items, then set `done`. |
| `plans/app-migration/plan.md:7` | Says the static pages are "the teaser at `/` and the about page at `/about/`". The about page is merged into `/`. | Edit the goal to one home page with a redirect stub. |
| `plans/teaser-content/plan.md` | `done`, but the Tailwind block shows the old four-token dark-only `@theme`. It also keeps footer-on-image decisions that were removed, and the Life Time LT Pro 48 and patent note, which you may not want in the repo. | Add a "superseded by `site/src/input.css`" note, and drop or move the footer-on-image decisions and the patent line. |
| `plans/site-content-v2/plan.md` | Step 3 describes `data-tally-open`, `data-tally-layout` attributes. The shipped code uses `data-tally-form` with `Tally.openPopup` (`idx:290, 399-405`). It also says "standard external rating systems" and mentions the engine. | Correct step 3, and re-check the external-name wording against the commit that removed DUPR mentions (`3ce4569`). |
| `plans/about-redesign/plan.md` | `done` with one unchecked step ("Carry it into `app/`"). It lists prototypes as removed (`about.html`, `icon.html`, `icon-5.html`, `icon-c.html`, `icon-u.html`), yet `design/marks.html` and `design/icon-d.html` remain. It names UTR's mark twice, which conflicts with the "remove external system names" decision. | Move the unchecked step to `plans/frontend-v1`, and list the surviving `design/` files. Rename "after UTR's mark" and "Inspired by UTR's mark". |
| `design/content-v2.html`, `design/shared.css` | Prototype for the finished `site-content-v2` plan. It uses different CSS (dark-only, 16px radii, lime `#c8e64b`) and a "Proposed additions" token comment that has since landed. The plan still links to it. | Archive or delete after the plan is closed (git history keeps it), or at least relabel it. |
| `design/marks.html` | Logo exploration that still shows the pine and optic-yellow-era ideas and "Social cards for /about/" (`:96, :121-122`). The final logo shipped in `site/`. | Delete or archive. Keep `design/tools/*`, since the site docs use them. |
| `design/icon-d.html` | Logo D explorer. Its output is `design/assets/*`. It uses `#c8f23c`. | Keep until the logo is final, then archive. It is the parametric source for `export-logo.py`. |
| `design/assets/mark.svg`, `design/assets/favicon.svg` | Byte-identical copies of `site/public/assets/img/mark.svg` and `favicon.svg` (verified with `cmp`). | Keep one canonical copy. Prefer a single source in `app/static` or `app/src/lib/assets` and generate from `export-logo.py`. |
| `app/src/lib/assets/favicon.svg` | The old logo (Krona O with two swooshes, 110px tile, white). The site now uses the D1 segmented-spin ball. | Replace with `site/public/assets/img/favicon.svg`. |
| `app/src/routes/+page.svelte`, `page.test.ts` | "Welcome to SvelteKit" boilerplate. The test only checks for an `<h1>`. | Replace with the real home page. Keep the test pattern. |
| `app/src/routes/layout.css` | Only `@import 'tailwindcss'`. | Paste in the `@theme` block, the `light` variant and the utilities (`wrap`, `label`, `mark`, `shimmer`, `arrow-link`, `reveal`). |
| `app/src/lib/index.ts` | Starter comment only. | Replace with real exports. |
| `app/src/app.html` | Starter file, but it lacks the head pieces the site has: the no-flash theme script, `theme-color` metas, font preloads. `<meta name="text-scale" content="scale">` came from `sv create`. | Add the inline theme script and the metas. |
| `app/static/robots.txt` | Allows everything, but the site is meant to be `noindex` for 404 and about. Not stale until deploy. | Decide before deploy. |
| `app/vite.config.ts` | `adapter-auto` boilerplate and comments. Out of scope for design, noted for the app-and-ci report. | Replace when the host is chosen. |
| `.claude/launch.json` | Entry `teaser` serves `site/public`, which is now the whole site. | Rename to `site`. Keep `design` while the design folder exists. |
| `site/AGENTS.md:3` | Calls the site "temporary", and the `design/tools/export-logo.py` reference is correct. No stale facts found. | None. |
| `site/public/about/index.html` | Redirect stub kept for old links, which is useful until the domain has no inbound `/about/` links. | Keep. Add a `<link rel="icon">` and fonts only if you care about the flash. |
| `.claude/worktrees/*` (3 git worktrees: `browser-tab-title-2ce835`, `open-tagline-redundancy-953a64`, `transparent-copy`) | Ignored by `.gitignore` but still registered with `git worktree list`. They are copies of the repo, including `design/about.html`, and they will show up in greps. | Prune with `git worktree remove` once the branches are merged. |
| `../open-ui` | Archived (README says so). HEAD is `e3ef0cc` (2026-11-10), with the remote `main` in sync. Nothing is newer than `frontend`: the only files that exist only there are the ignored generated `main.css` and `app/.vscode/` (deliberately not imported). It also has a local `.claude/worktrees/agent-tooling-6d5bd0`. | Safe to delete locally after confirming the GitHub repo is archived. |
| `../brand-assets` | `git init` only: no commits, empty working tree, branch `main`. There are no logos, colors or fonts in it. | Either populate it or remove it. The real brand assets are in `site/public/assets/` and `design/`. |

---

## 5. Logo and icon assets

| Asset | Path | Notes |
|---|---|---|
| Logo mark (SVG, white, `viewBox -2 -2 104 104`) | `site/public/assets/img/mark.svg` | D1 "Segmented spin" ball with holes. Used as a CSS mask, so it takes `currentColor`. Same as `design/assets/mark.svg`. |
| Favicon (SVG, ivory `#f7f3e8` mark on black rounded tile, 110px) | `site/public/assets/img/favicon.svg` | Mark at 85%, thicker spin marks so they hold at 16px. Same as `design/assets/favicon.svg`. |
| Favicon PNG 48x48, transparent corners | `site/public/assets/img/favicon-48.png` | Browser render of `favicon.svg`. |
| Apple touch icon 180x180, square black tile | `site/public/assets/img/apple-touch-icon.png` | Browser render of `favicon.svg`. |
| Social card 1200x630 | `site/public/assets/img/og.jpg` | Wordmark above the ball. Predates the logo and does not show the mark. |
| Hero renders (AVIF and JPEG, 3 art directions) | `site/public/assets/img/horizon-{tall,land,wide}-*.{avif,jpg}` | tall 640/828/1290/2048, land 1280/1920/2560/3840, wide 1600/2560/3840. About 2.5 MB for `img/`. |
| Fonts + licenses | `site/public/assets/fonts/` | Krona One, Instrument Sans (variable), and `OFL-*.txt`. |
| Old logo (outdated) | `app/src/lib/assets/favicon.svg` | Do not use. |
| Logo generators | `design/tools/export-logo.py`, `design/tools/fit-ball-mask.py` | Parametric D1 export. Ball mask fitter. |

There is no horizontal lockup file. The mark plus the Krona One text `OPEN` is built in HTML (`idx:90-93, 230`) with `gap 0.32em` in the hero and `gap-3` in the header. A wordmark-only SVG does not exist.

---

## 6. Real people's data

| Path | Finding |
|---|---|
| `site/`, `app/`, `design/`, `.github/` | No personal names, phone numbers or personal emails found. Only emails: the role address `info@openpb.org` in `site/public/index.html` and `design/content-v2.html`. |
| `site/public/index.html` | Links go to the org's GitHub (`openpickleball`), the Tally form `Kp50eD`, and `github.com/openpickleball/...`. These are organization links, not individuals. |
| `.claude/worktrees/*/` | The same files, copies only. |
| `plans/teaser-content/plan.md` | Mentions a patent application number and the Life Time product name, which are not personal data. |

Nothing to remove under the real-data rule. Verified by grep for email, phone and social-profile patterns, and by reading all of `site/public/*.html`, `site/src/input.css` and `app/src`.
