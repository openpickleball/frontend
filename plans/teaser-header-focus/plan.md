# Show the hidden header when keyboard focus reaches it (issue #16), and spell open-source with a hyphen (issue #52)

**Status:** done

Risk tier: Medium. One class list in `site/public/index.html`, but it changes existing interactive behavior (focus, a scroll-driven show and hide) that `site/` has no automated test for, so only a browser drive proves it. The change goes live on openpb.org when merged.

Domain skills: chrome-devtools-mcp:a11y-debugging: invoke (implementer, live drive: focus order and visibility). chrome-devtools-mcp:chrome-devtools: invoke (live drive). frontend-design: not applicable because nothing about the look changes; the header appears exactly as it does after scrolling. superpowers:test-driven-development: invoke, with the browser measurement as the red and green check because `site/` has no test runner. context7: invoke only if the Tailwind variant order (see Risks) needs checking against the docs. All others (Django, Expo, React, email, payments, auth): not applicable, no such code.

## Goal

Issue #16 is an accessibility check of the teaser. Its findings are recorded on the issue. This plan fixes finding 1: while the teaser fills the screen, the header is hidden with `opacity: 0` and `pointer-events: none`, but its links ("OPEN" and "Get involved", plus "What we stand for" and "Open source" on wide screens) stay in the tab order. A keyboard player presses Tab and focus lands on links nobody can see (WCAG 2.4.7, focus visible).

Finding 2 (the arrow after "Get involved" is read aloud) is a separate pull request, as the issue asks for one pull request per kind of fix.

## Decisions

- Show the header while it holds keyboard focus, rather than taking its links out of the tab order. Removing them (`inert` or `visibility: hidden`) would also hide the "Main" navigation landmark from screen readers on the teaser, so a screen reader player landing on the page would find no navigation until they scrolled. Showing the header keeps the navigation reachable and visible.
- Use `:has(:focus-visible)` (Tailwind `has-focus-visible:`), not `focus-within`. A header link can hold focus that is not keyboard focus: a player clicks a header link while the header is shown, or a script focuses it after a mouse interaction, then scrolls back to the top. `focus-within` would keep the header shown over the teaser in that case. `:focus-visible` matches only when the browser would show a focus ring, which is the keyboard case this fix is for. `:has()` is supported in all current major browsers. The first version of this fix used `focus-within`; review found the case above, and the red measurement for it is under Proof.
- When keyboard focus leaves the header, it hides again if the teaser still fills the screen. The scroll script is unchanged: it keeps toggling `data-hidden`, and the focus rule only overrides the hidden styles while focus is inside.
- Reduced motion already turns off the header's transition (`motion-reduce:transition-none`), so it appears at once.
- The noscript style in the head is unchanged: without JavaScript the header is always shown.

## Acceptance criteria

1. With the page at the top (teaser filling the screen, `#site-nav` has `data-hidden`), when any link inside `#site-nav` has keyboard focus, `#site-nav` has computed `opacity: 1`, `pointer-events: auto`, and no translate offset (`translate` computes to `none` or `0px`).
2. When focus then moves out of the header (Tab past its last link to the theme toggle, or Shift+Tab back to the skip link), `#site-nav` returns to computed `opacity: 0` and `pointer-events: none`, while the page is still at the top.
3. Scrolling behavior is unchanged: with no focus in the header, `#site-nav` is hidden at the top and shown once most of the teaser has scrolled away, as on `main`.
4. Both themes (black and ivory) show the focused header the same way it looks after scrolling, and with reduced motion it appears with no transition.
5. With the page at the top, a header link that holds focus without `:focus-visible` (mouse or scripted focus taken while the header was shown) does not keep the header shown: `#site-nav` computes to `opacity: 0` and `pointer-events: none`.
6. `pnpm build` in `site/` succeeds.

## Files that change

- `site/public/index.html`: add the keyboard focus override classes to the `<header id="site-nav">` class list, and update the comment above the header to say it also shows while one of its links has keyboard focus.
- `plans/teaser-header-focus/plan.md`: this plan; tick the steps and set the status to done at the end.
- For issue #52 (see the section at the end): `site/public/index.html` (visible text of the nav link, the section label, one sentence, and one HTML comment) and `plans/open-source-explainer/plan.md` (its recorded copy and a new Decision), and `site/AGENTS.md` (the spelling rule).

`site/public/assets/css/main.css` is generated and not committed. `site/AGENTS.md` does not describe the header. For issue #52 it gets the spelling rule, so future copy keeps the hyphen.

## Steps

- [x] Red: on the unchanged page, serve `site/public/` (run `pnpm build` in `site/` first), load `/` at the top, press Tab until a link inside `#site-nav` has focus, and record `document.activeElement` and the computed `opacity` of `#site-nav`. Expected today: the focused element is inside `#site-nav` and its opacity is `0`.
- [x] Red for criterion 5: on the `focus-within` version, scroll down until the header shows, give a header link focus that is not `:focus-visible`, scroll back to the top, and record `data-hidden`, `opacity` and `pointer-events`. Expected: `data-hidden` is set but the header stays at opacity `1`.
- [x] Green: add the override to the header's class list:
      `data-hidden:has-focus-visible:pointer-events-auto data-hidden:has-focus-visible:translate-y-0 data-hidden:has-focus-visible:opacity-100`.
      The stacked `data-hidden:has-focus-visible:` form is there so the override has higher specificity than the `data-hidden:` hide classes and wins whatever order Tailwind emits them in (see Risks). Rebuild with `pnpm build` and confirm in the compiled `main.css` that the override rules are present and use `:has(:focus-visible)`.
- [x] Update the comment above the header.
- [x] Gate: `pnpm build` in `site/`.
- [x] Live drive: criteria 1 to 5, at a wide viewport (all three nav links shown) and a narrow one (only "OPEN" and "Get involved"), each in the black and the ivory theme, and with reduced motion emulated at least once at each width.
- [x] Set this plan's status to done.

## Risks

- Variant order: if the override were plain `has-focus-visible:opacity-100`, it and `data-hidden:opacity-0` would have the same specificity, and whichever Tailwind emits last would win. Stacking both variants avoids depending on that order. Check the computed styles in the browser, not just the class list.
- `translate-y-0` must cancel `-translate-y-2`. In Tailwind v4 both set the `--tw-translate-y` variable used by the `translate` property, so check the computed `translate` in the drive.
- The theme toggle sits in a separate fixed layer (`z-30`) over the header area. Showing the header must not cover it or change its tab position. The header's right padding already leaves room for it.
- The skip link (`z-30`, top left) and the header's "OPEN" link share the top left corner. When focus moves from the skip link to "OPEN", the skip link slides away, so they should not overlap. Check it in the drive.
- `:focus-visible` after scripted focus depends on the last input: Chrome treats `element.focus()` as `:focus-visible` when there has been no pointer input yet, and not after a mouse click. The drive for criterion 5 therefore clicks first, then focuses.
- What this does not do: it does not change the scroll threshold, the nav links, or finding 2. (Issue #52, at the end of this plan, changes one nav link's text.)

## Proof

- Criteria 1 and 2: the live drive reads `document.activeElement` and `getComputedStyle(#site-nav)` (`opacity`, `pointer-events`, `translate`) after each Tab and Shift+Tab, at the top of the page, before (red) and after (green) the change.
- Criterion 3: scroll down past the threshold and back, with focus outside the header; record `data-hidden` and computed opacity at each end.
- Criterion 4: screenshots of the focused header at the top in both themes, and the computed `transition-duration` (or `transition: none`) with reduced motion emulated.
- Criterion 5: scroll down, click a header link or focus one by script after a mouse click, confirm `:focus-visible` is false, scroll to the top, and record `data-hidden`, `opacity` and `pointer-events`.
- Criterion 6: the `pnpm build` output.
- Screenshots are saved outside the repo and referenced below by path.

### Red (before the change)

Chrome, viewport 1280x800, black theme, page at the top (`scrollY` 0), served from `site/public/` after `pnpm build`. Values from `getComputedStyle(#site-nav)` after each Tab, read 400 ms later:

| Key | `document.activeElement` | `data-hidden` | `opacity` | `pointer-events` | `translate` |
| --- | --- | --- | --- | --- | --- |
| (none) | `body` | yes | `0` | `none` | `0px -8px` |
| Tab | `A` "Skip to content" | yes | `0` | `none` | `0px -8px` |
| Tab | `A` "OPEN", inside `#site-nav` | yes | `0` | `none` | `0px -8px` |

Focus is on a link inside the header while the header is invisible. This is the defect.

### Red for criterion 5 (on the `focus-within` version, commit f34dfd6)

Chrome, viewport 1280x800, black theme. `#site-nav` uses `data-hidden:focus-within:*` overrides.

| Step | `document.activeElement` | `:focus-visible` | `data-hidden` | `opacity` | `pointer-events` | `translate` | `scrollY` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scroll to 720, header shown | `body` | n/a | no | `1` | `auto` | `none` | 720 |
| Mouse click on "Open source" in the header (jumps to `#open-source`) | `body` | n/a | no | `1` | `auto` | `none` | 1472 |
| `link.focus()` on "Open source" after that click | "Open source" in `#site-nav` | false | no | `1` | `auto` | `none` | 1472 |
| Scroll to 0, read 400 ms later | "Open source" in `#site-nav` | false | yes | `1` | `auto` | `0px` | 0 |

The header stays shown over the teaser with `data-hidden` set. Screenshot: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/red2-wide-black-mousefocus-top.png`.

Note: before any pointer input, `link.focus()` did match `:focus-visible` in Chrome, so the click comes first. In this Chrome a mouse click on a same-page link left focus on `body` after the jump, so the scripted focus stands in for a browser that keeps focus on the clicked link.

The green record for the `focus-within` version is in the history of this file (commit 7a4ddef). It is replaced by the green record for the `:has(:focus-visible)` version below.

### Green (after the change, `:has(:focus-visible)`, commit 65fa55f)

Compiled `main.css`: `.data-hidden\:has-focus-visible\:opacity-100[data-hidden]:has(:focus-visible){opacity:1}`, plus the matching `pointer-events-auto` and `translate-y-0` rules. Their specificity (0,3,0) is higher than the hide rules such as `.data-hidden\:opacity-0[data-hidden]` (0,2,0).

How the values were read: `getComputedStyle(#site-nav)` and `document.activeElement` through Chrome DevTools, one call after each key press. With motion on, the headless page only advances a transition when it renders a frame, so those reads first finish `#site-nav`'s own transitions (`getAnimations().forEach(a => a.finish())`) to show the settled state. With reduced motion, `transition-property` computes to `none` and the values are read as they are, in the first read after the key press. "Topmost" means `document.elementFromPoint` at the element's center returns that element. All Tab and Shift+Tab steps are at `scrollY` 0 with `data-hidden` set, and every keyboard focus reported `:focus-visible` true.

Columns: `opacity` / `pointer-events` / `translate` of `#site-nav`. "Shown" is `1` / `auto` / `0px`. "Hidden" is `0` / `none` / `0px -8px`.

**A. Wide (1280x800, all three nav links shown), black, motion on**

| Step | Focus | `#site-nav` |
| --- | --- | --- |
| Load | `body` | hidden |
| Tab | "Skip to content" | hidden |
| Tab | "OPEN" in header | shown |
| Tab | "What we stand for" in header | shown |
| Tab | "Open source" in header | shown |
| Tab | "Get involved" in header | shown |
| Tab | theme toggle, topmost | hidden |
| Shift+Tab | "Get involved" in header | shown |
| Shift+Tab x3 | "OPEN" in header | shown |
| Shift+Tab | "Skip to content" at 16,12, topmost | hidden |
| Criterion 3: blur, scroll to 720 | `body` | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 3: scroll to 0 | `body` | `data-hidden` set, hidden |
| Criterion 5: scroll to 720, mouse click "Open source" in header (jumps to 1472), then `link.focus()` | "Open source" in header, `:focus-visible` false | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 5: scroll to 0 | "Open source" in header, `:focus-visible` false | `data-hidden` set, hidden |

**B. Wide (1280x800), ivory, reduced motion** (`transition-property: none`)

| Step | Focus | `#site-nav` |
| --- | --- | --- |
| Load | `body` | hidden |
| Tab x2 | "OPEN" in header | shown |
| Tab | "What we stand for" in header | shown |
| Tab | "Open source" in header | shown |
| Tab | "Get involved" in header | shown |
| Tab | theme toggle at x 1186, topmost | hidden |
| Shift+Tab | "Get involved" in header | shown |
| Shift+Tab x3 | "OPEN" in header | shown |
| Shift+Tab | "Skip to content" at 16,12, topmost | hidden |
| Criterion 3: blur, scroll to 720 | `body` | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 3: scroll to 0 | `body` | `data-hidden` set, hidden |
| Criterion 5: scroll to 720, mouse click "Open source" in header (jumps to 1472), then `link.focus()` | "Open source" in header, `:focus-visible` false | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 5: scroll to 0 | "Open source" in header, `:focus-visible` false | `data-hidden` set, hidden |

**C. Narrow (390x844, only "OPEN" and "Get involved" shown), black, reduced motion** (`transition-property: none`)

| Step | Focus | `#site-nav` |
| --- | --- | --- |
| Load | `body` | hidden |
| Tab x2 | "OPEN" in header | shown |
| Tab | "Get involved" in header | shown |
| Tab | theme toggle at x 328 to 364, topmost | hidden |
| Shift+Tab | "Get involved" in header | shown |
| Shift+Tab | "OPEN" in header | shown |
| Shift+Tab | "Skip to content" at 16,12, topmost | hidden |
| Criterion 3: blur, scroll to 760 | `body` | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 3: scroll to 0 | `body` | `data-hidden` set, hidden |
| Criterion 5: scroll to 760, mouse click on the "A rating that belongs to the players" heading, then `focus()` on the header "OPEN" link | "OPEN" in header, `:focus-visible` false | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 5: scroll to 0 | "OPEN" in header, `:focus-visible` false | `data-hidden` set, hidden |

**D. Narrow (390x844), ivory, motion on**

| Step | Focus | `#site-nav` |
| --- | --- | --- |
| Load | `body` | hidden |
| Tab x2 | "OPEN" in header | shown |
| Tab | "Get involved" in header | shown |
| Tab | theme toggle at x 328 to 364, topmost | hidden |
| Shift+Tab | "Get involved" in header | shown |
| Shift+Tab | "OPEN" in header | shown |
| Shift+Tab | "Skip to content" at 16,12, topmost | hidden |
| Criterion 3: blur, scroll to 760 | `body` | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 3: scroll to 0 | `body` | `data-hidden` set, hidden |
| Criterion 5: scroll to 760, mouse click on the "A rating that belongs to the players" heading, then `focus()` on the header "OPEN" link | "OPEN" in header, `:focus-visible` false | `data-hidden` removed, `1` / `auto` / `none` |
| Criterion 5: scroll to 0 | "OPEN" in header, `:focus-visible` false | `data-hidden` set, hidden |

Criterion 4 screenshots, reviewed. The keyboard-focused header at the top looks the same as the scrolled header in both themes, and the header is gone after the mouse focus path:

- A, keyboard focus on "OPEN": `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-black-kbd-open.png`
- A, mouse focus path back at the top: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-black-mousefocus-top.png`
- B, keyboard focus on "OPEN": `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-ivory-reduced-kbd-open.png`
- B, mouse focus path back at the top: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-ivory-reduced-mousefocus-top.png`
- C, keyboard focus on "Get involved": `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-narrow-black-reduced-kbd-getinvolved.png`
- C, mouse focus path back at the top: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-narrow-black-reduced-mousefocus-top.png`
- D, keyboard focus on "OPEN": `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-narrow-ivory-kbd-open.png`
- D, mouse focus path back at the top: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-narrow-ivory-mousefocus-top.png`

Criterion 4, keyboard-focused header at the top against the scrolled header (wide, 1280x800). The scrolled shots have focus on `body` at `scrollY` 720:

| Theme | Keyboard focus at top | Scrolled, no focus | Matched |
| --- | --- | --- | --- |
| Black | `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-black-kbd-open.png` | `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g3-wide-black-scrolled.png` | Background `oklab(0 0 0 / 0.8)` with `blur(12px)`, height 64 px at top 0, link colors "OPEN" and "Get involved" `rgb(255, 255, 255)`, "What we stand for" and "Open source" `rgb(189, 189, 189)`. Same values in both states. |
| Ivory | `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g2-wide-ivory-reduced-kbd-open.png` | `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/g3-wide-ivory-scrolled.png` | Background `oklab(0.964242 -0.0000181794 0.0151916 / 0.8)` with `blur(12px)`, height 64 px at top 0, link colors "OPEN" and "Get involved" `rgb(23, 21, 15)`, "What we stand for" and "Open source" `rgb(77, 73, 63)`. Same values in both states. The ivory values at the top were read with keyboard focus on "Get involved". |

In both pairs the links sit in the same places. The only visible differences are the focus ring on the focused link and the page content showing through the 80 percent background (the teaser wordmark at the top, section text when scrolled).

Criterion 6: `pnpm build` in `site/` passed (tailwindcss v4.3.5, "Done in 41ms").

## Issue #52: one spelling of "open-source"

This plan also covers issue #52, folded into this branch at the user's request (2026-11-17). The issue 16 sections above change only to point to this section (the title, "Files that change" and Risks). Their proof records quote the nav link as "Open source", the text when they ran; a rerun now expects "Open-source".

### Goal

openpb.org writes the term two ways. "Open-source software publishes it" is hyphenated, but the nav link, the section label and "You already use open source every day" are not. The site should use one form.

### Decision

- Visible text spells the term "open-source", with a hyphen, as noun and adjective (user, 2026-11-17, issue #52). Ids, anchors and `aria-labelledby` values (`#open-source`, `open-source-title`) stay as they are.
- The HTML comment above the section changes too, for consistency, though visitors don't read it.
- `plans/site-content-v2/plan.md` Decisions were read first. They name "the Open source section" in plan prose only and set no spelling for visible text, so nothing there conflicts.

### Acceptance criteria

- (a) No visible text on the page contains "open source" without a hyphen. Checked in the browser with `document.body.innerText` at 1280x800 and 390x844 (this covers the nav link, which is hidden below `md`, and the uppercase label), and by a grep of `site/public/index.html` and `site/public/404.html` for `open\s+source` (case-insensitive, across line breaks). Ids and anchors already use the hyphen, so the grep doesn't match them.
- (b) The recorded copy in `plans/open-source-explainer/plan.md` matches the page.
- (c) `pnpm build` in `site/` passes.

### Steps

- [x] Red: run the criterion (a) checks on the current page and record them below.
- [x] Change the three visible strings and the comment in `site/public/index.html`, and update `plans/open-source-explainer/plan.md`.
- [x] Add the spelling rule to `site/AGENTS.md`, so later copy edits keep the hyphen.
- [x] Gate: `pnpm build` in `site/`.
- [x] Live drive: the criterion (a) check at both widths, screenshots of the nav (wide) and the section label in both themes, and a Tab into the header at the top to confirm the issue 16 fix still shows it.

### Proof

Red, before the change (2026-11-17, Chrome, black theme, page at the top).

Grep (`python3` regex `open\s+source`, case-insensitive, over the whole file, scratch script):

```
site/public/index.html: 4 unhyphenated
  line 98: 'Open source'
  line 278: 'Open source'
  line 281: 'Open source'
  line 294: 'open source'
site/public/404.html: 0 unhyphenated
```

Line 98 is the nav link, 278 the HTML comment, 281 the section label and 294 the sentence.

`document.body.innerText` (matches of `/open\s+source/gi`, with context):

```
1280x800: 3 unhyphenated, 1 hyphenated
  "e stand for\nOpen source\nGet invol"
  "load.\n\n02 · OPEN SOURCE\n\nBuilt in"
  "already use open source every day"
390x844: 2 unhyphenated, 1 hyphenated
  "load.\n\n02 · OPEN SOURCE\n\nBuilt in"
  "already use open source every day"
```

At 390 wide the nav link is hidden (`max-md:hidden`), so it is not in `innerText`. The label is uppercased by CSS, which `innerText` reflects.

Green, after the change (commit message "Spell open-source with a hyphen in all visible text").

Grep:

```
site/public/index.html: 0 unhyphenated
site/public/404.html: 0 unhyphenated
```

`document.body.innerText`, after a cache-bypassing reload:

```
1280x800: 0 unhyphenated, 4 hyphenated
  "e stand for\nOpen-source\nGet invol"
  "load.\n\n02 · OPEN-SOURCE\n\nBuilt in"
  "ipe secret. Open-source software "
  "already use open-source every day"
390x844: 0 unhyphenated, 3 hyphenated (nav link hidden below md)
```

Criterion (b): the explainer plan's Label line, acceptance criteria 1 and 2 and the second-paragraph quote now read "Open-source" / "open-source", matching the page. Its recorded check output from issue #23 is left as it ran, with a note on what a rerun should now expect. A Decision records the spelling.

Criterion (c): `pnpm build` in `site/` passed (tailwindcss v4.3.5, "Done in 32ms").

Nav fit at 768 wide (the `md` breakpoint, where the nav links first show), since the label is one character longer: "What we stand for" 323 to 446, "Open-source" 464 to 552, "Get involved" 570 to 678, each one line (20 px high). The theme toggle sits at 694 to 730, so nothing overlaps, and `scrollWidth` 753 is within the 768 viewport.

Issue 16 check: at 1280x800, black, top of the page, Tab x4 put keyboard focus on the "Open-source" nav link (`:focus-visible` true). `#site-nav` was shown: `data-hidden` set, opacity `1`, pointer-events `auto`, translate `0px`.

Screenshots (1280x800), reviewed:

- Nav, black, keyboard focus on "Open-source" at the top: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/os52-wide-black-nav.png`
- Nav, ivory, scrolled to 720: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/os52-wide-ivory-nav.png`
- Section label "02 · OPEN-SOURCE" and the "open-source every day" sentence, black: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/os52-wide-black-label.png`
- Same, ivory: `/tmp/claude-1000/-home-bradstricherz-WebstormProjects-frontend/a0e58315-6f98-4059-ac54-d0a38822d5f2/scratchpad/os52-wide-ivory-label.png`
