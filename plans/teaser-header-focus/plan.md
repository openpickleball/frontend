# Show the hidden header when keyboard focus reaches it (issue #16)

**Status:** done

Risk tier: Medium. One class list in `site/public/index.html`, but it changes existing interactive behavior (focus, a scroll-driven show and hide) that `site/` has no automated test for, so only a browser drive proves it. The change goes live on openpb.org when merged.

Domain skills: chrome-devtools-mcp:a11y-debugging: invoke (implementer, live drive: focus order and visibility). chrome-devtools-mcp:chrome-devtools: invoke (live drive). frontend-design: not applicable because nothing about the look changes; the header appears exactly as it does after scrolling. superpowers:test-driven-development: invoke, with the browser measurement as the red and green check because `site/` has no test runner. context7: invoke only if the Tailwind variant order (see Risks) needs checking against the docs. All others (Django, Expo, React, email, payments, auth): not applicable, no such code.

## Goal

Issue #16 is an accessibility check of the teaser. Its findings are recorded on the issue. This plan fixes finding 1: while the teaser fills the screen, the header is hidden with `opacity: 0` and `pointer-events: none`, but its three links ("OPEN", "Get involved", and on wide screens "What we stand for" and "Open source") stay in the tab order. A keyboard player presses Tab and focus lands on links nobody can see (WCAG 2.4.7, focus visible).

Finding 2 (the arrow after "Get involved" is read aloud) is a separate pull request, as the issue asks for one pull request per kind of fix.

## Decisions

- Show the header while it holds keyboard focus, rather than taking its links out of the tab order. Removing them (`inert` or `visibility: hidden`) would also hide the "Main" navigation landmark from screen readers on the teaser, so a screen reader player landing on the page would find no navigation until they scrolled. Showing the header keeps the navigation reachable and visible.
- Use `focus-within`, not `:has(:focus-visible)`. A mouse cannot click the hidden header (`pointer-events: none`), so focus only gets there from the keyboard or a script, and `focus-within` has the wider browser support.
- When focus leaves the header, it hides again if the teaser still fills the screen. The scroll script is unchanged: it keeps toggling `data-hidden`, and the focus rule only overrides the hidden styles while focus is inside.
- Reduced motion already turns off the header's transition (`motion-reduce:transition-none`), so it appears at once.
- The noscript style in the head is unchanged: without JavaScript the header is always shown.

## Acceptance criteria

1. With the page at the top (teaser filling the screen, `#site-nav` has `data-hidden`), when any link inside `#site-nav` has keyboard focus, `#site-nav` has computed `opacity: 1`, `pointer-events: auto`, and no translate offset (`translate` computes to `none` or `0px`).
2. When focus then moves out of the header (Tab past its last link to the theme toggle, or Shift+Tab back to the skip link), `#site-nav` returns to computed `opacity: 0` and `pointer-events: none`, while the page is still at the top.
3. Scrolling behavior is unchanged: with no focus in the header, `#site-nav` is hidden at the top and shown once most of the teaser has scrolled away, as on `main`.
4. Both themes (black and ivory) show the focused header the same way it looks after scrolling, and with reduced motion it appears with no transition.
5. `pnpm build` in `site/` succeeds.

## Files that change

- `site/public/index.html`: add the focus-within override classes to the `<header id="site-nav">` class list, and update the comment above the header to say it also shows while it holds focus.
- `plans/teaser-header-focus/plan.md`: this plan; tick the steps and set the status to done at the end.

`site/public/assets/css/main.css` is generated and not committed. `site/AGENTS.md` does not describe the header, so it needs no change.

## Steps

- [x] Red: on the unchanged page, serve `site/public/` (run `pnpm build` in `site/` first), load `/` at the top, press Tab until a link inside `#site-nav` has focus, and record `document.activeElement` and the computed `opacity` of `#site-nav`. Expected today: the focused element is inside `#site-nav` and its opacity is `0`.
- [x] Green: add the override to the header's class list. Starting point:
      `data-hidden:focus-within:pointer-events-auto data-hidden:focus-within:translate-y-0 data-hidden:focus-within:opacity-100`.
      The stacked `data-hidden:focus-within:` form is there so the override has higher specificity than the `data-hidden:` hide classes and wins whatever order Tailwind emits them in (see Risks). Rebuild with `pnpm build` and confirm in the compiled `main.css` that the override rules are present.
- [x] Update the comment above the header.
- [x] Gate: `pnpm build` in `site/`.
- [x] Live drive: criteria 1 to 4, at a wide viewport (all three nav links shown) and a narrow one (only "OPEN" and "Get involved"), in the black theme, the ivory theme, and with reduced motion emulated.
- [x] Set this plan's status to done.

## Risks

- Variant order: if the override were plain `focus-within:opacity-100`, it and `data-hidden:opacity-0` would have the same specificity, and whichever Tailwind emits last would win. Stacking both variants avoids depending on that order. Check the computed styles in the browser, not just the class list.
- `translate-y-0` must cancel `-translate-y-2`. In Tailwind v4 both set the `--tw-translate-y` variable used by the `translate` property, so check the computed `translate` in the drive.
- The theme toggle sits in a separate fixed layer (`z-30`) over the header area. Showing the header must not cover it or change its tab position. The header's right padding already leaves room for it.
- The skip link (`z-30`, top left) and the header's "OPEN" link share the top left corner. When focus moves from the skip link to "OPEN", the skip link slides away, so they should not overlap. Check it in the drive.
- What this does not do: it does not change the scroll threshold, the nav links, or finding 2.

## Proof

- Criteria 1 and 2: the live drive reads `document.activeElement` and `getComputedStyle(#site-nav)` (`opacity`, `pointer-events`, `translate`) after each Tab and Shift+Tab, at the top of the page, before (red) and after (green) the change.
- Criterion 3: scroll down past the threshold and back, with focus outside the header; record `data-hidden` and computed opacity at each end.
- Criterion 4: screenshots of the focused header at the top in both themes, and the computed `transition-duration` (or `transition: none`) with reduced motion emulated.
- Criterion 5: the `pnpm build` output.

### Red (before the change)

Chrome, viewport 1280x800, black theme, page at the top (`scrollY` 0), served from `site/public/` after `pnpm build`. Values from `getComputedStyle(#site-nav)` after each Tab, read 400 ms later:

| Key | `document.activeElement` | `data-hidden` | `opacity` | `pointer-events` | `translate` |
| --- | --- | --- | --- | --- | --- |
| (none) | `body` | yes | `0` | `none` | `0px -8px` |
| Tab | `A` "Skip to content" | yes | `0` | `none` | `0px -8px` |
| Tab | `A` "OPEN", inside `#site-nav` | yes | `0` | `none` | `0px -8px` |

Focus is on a link inside the header while the header is invisible. This is the defect.

### Green (after the change)

Same setup. Compiled `main.css` holds `.data-hidden\:focus-within\:opacity-100[data-hidden]:focus-within{opacity:1}` and the matching `pointer-events-auto` and `translate-y-0` rules. Each value was read after the key press had settled (CDP evaluation can delay frames, so a transition read in the same call can look half done).

Wide (1280x800, all three nav links shown), black theme, page at the top:

| Key | `document.activeElement` | `data-hidden` | `opacity` | `pointer-events` | `translate` |
| --- | --- | --- | --- | --- | --- |
| Tab | "Skip to content" | yes | `0` | `none` | `0px -8px` |
| Tab | "OPEN" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Tab | "What we stand for" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Tab | "Open source" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Tab | "Get involved" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Tab | theme toggle (`Switch to light theme`) | yes | `0` | `none` | `0px -8px` |
| Shift+Tab | "Get involved" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Shift+Tab x3 | "OPEN" in `#site-nav` | yes | `1` | `auto` | `0px` |
| Shift+Tab | "Skip to content" | yes | `0` | `none` | `0px -8px` |

`scrollY` stayed `0` throughout. With "OPEN" focused the skip link is off screen (`y` -68), so they do not overlap. With the toggle or skip link focused, `document.elementFromPoint` at its center returns that element, so the header does not cover either.

Criterion 3, focus on `body`, black theme, wide: at the top `data-hidden` yes, opacity `0`. Scrolled to `scrollY` 720: `data-hidden` no, opacity `1`, pointer-events `auto`, translate `none`. Back to `0`: `data-hidden` yes, opacity `0`, pointer-events `none`.

Ivory theme, wide: Tab, Tab to "OPEN" in `#site-nav`: opacity `1`, pointer-events `auto`, translate `0px`, background ivory at 80 percent.

Narrow (390x844, only "OPEN" and "Get involved" shown), reduced motion emulated, ivory then black. `transition-property` computes to `none`, and the header computes to opacity `1` in the same frame focus arrives, with no wait:

| Key | Theme | `document.activeElement` | `opacity` | `pointer-events` | `translate` |
| --- | --- | --- | --- | --- | --- |
| Tab x2 | ivory | "OPEN" in `#site-nav` | `1` | `auto` | `0px` |
| Tab | ivory | "Get involved" in `#site-nav` | `1` | `auto` | `0px` |
| Tab | ivory | theme toggle, topmost at its center | `0` | `none` | `0px -8px` |
| Shift+Tab | black | "Get involved" in `#site-nav` | `1` | `auto` | `0px` |
| Shift+Tab x2 | black | "Skip to content", topmost at `16,12` | `0` | `none` | `0px -8px` |

On narrow screens the toggle sits at x 328 to 364 and "Get involved" ends at x 312, so the shown header does not cover the toggle. Screenshots of the focused header in both themes were reviewed and match the scrolled header. `pnpm build` passed.
