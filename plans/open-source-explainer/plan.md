# Open-source explainer on openpb.org (issue #23)

**Status:** done

Risk tier: Medium. Copy and markup only: no new script, and `src/input.css` is unchanged (the markup uses standard Tailwind utilities only). But it adds a section to the live home page (deploys on merge), renumbers an existing section, and its layout, themes and scroll reveal can only be checked in a browser.

Domain skills: frontend-design: not applicable because the section reuses the existing pillar pattern and adds no new visual design. chrome-devtools-mcp:a11y-debugging: invoke for the live drive (heading order, link names, focus). humanizer: invoke on the final copy. All others (Django, Expo, React, email, payments, auth): not applicable, static HTML only.

## Goal

openpb.org explains, in plain language for players, what open-source software is and why OPEN is built that way. It only says what is true today and puts future features in "will".

## Acceptance criteria

1. `site/public/index.html` has a new section `<section id="open-source" aria-labelledby="open-source-title">` between `#about` and `#help`, with the label `02 · Open-source` and the `h2` "Built in the open". `#help`'s label becomes `03 · Get involved`.
2. The header nav has an "Open-source" link to `#open-source`, between "What we stand for" and "Get involved", hidden below `md` like "What we stand for".
3. The section text is exactly the copy under "Copy" below. It contains no em dashes, says nothing about how ratings are calculated, and doesn't mention GitHub hosting or Tally.
4. The "It can't be locked up" item says, in one line, that a copy can't present itself as OPEN, and links to `LICENSING.md` (licensing and trademark).
5. Every link in the section that leaves openpb.org has `target="_blank" rel="noopener"` and a visually hidden " (opens in a new tab)".
6. The section uses the site's existing custom utilities and color tokens (`wrap`, `label`, `reveal`, `border-line`, `text-muted`, `text-secondary` and so on) plus standard Tailwind utilities (for example `underline`, `underline-offset-4`, `inline-block`). `src/input.css` is unchanged.
7. The page reads correctly in the black and ivory themes, with reduced motion, and at 375px wide with no horizontal scroll. Headings go h1, h2, h3 with no skipped level.
8. `site/AGENTS.md` describes the page's sections including `#open-source`.
9. `pnpm build` in `site/` passes.

## Copy

Label: `02 · Open-source`

Heading (h2): Built in the open

Intro (lead paragraph, same style as `#about`'s):
> Every app and website is built from written instructions called source code. Think of it as the recipe. Most companies keep their recipe secret. Open-source software publishes it, so anyone can read it, use it for free, improve it and share it.

Second paragraph (smaller, muted):
> You already use open-source every day. Android, Firefox, Wikipedia, WordPress, VLC and Signal are all built on it.

Three items, same markup as the `#about` pillars (`h3` plus paragraph):

- **Anyone can check the work** All of OPEN's code is public, so anyone can read exactly what it does. [See the code](https://github.com/openpickleball)
- **It can't be locked up** OPEN's code uses a license, the GNU AGPL, that lets anyone use, copy and change it. Anyone who runs a changed copy as a website has to share their changes too, so nobody can take OPEN's code and make it private. A copy can't present itself as OPEN. [Licensing and trademark](https://github.com/openpickleball/.github/blob/main/LICENSING.md)
- **Anyone can help** Players, developers and designers can all suggest changes. Even our plans, and the reasons behind each decision, are written down in public.

## Files that change

- `site/public/index.html`: nav link, new section, `#help` label renumbered.
- `site/AGENTS.md`: the line describing `public/index.html`'s sections.
- `plans/site-content-v2/plan.md`: notes pointing to this section: in its Goal, and on its GitHub-link and license Decisions.
- `plans/open-source-explainer/plan.md`: this file, ticked off as work lands.

## Steps

- [x] Answer the issue's open questions (see Decisions).
- [x] Write the check script (in the run's scratch directory, not committed) and run it red on `main`.
- [x] Add the nav link, the section and the renumbered label to `index.html`. Run the check green and `pnpm build`.
- [x] Update `site/AGENTS.md`.
- [x] Live drive: both themes, reduced motion, 375px and 1440px, nav link, keyboard focus through the new links.

## Risks

- Overclaiming. The section must not say ratings exist or describe the rating method. The copy above says anyone can "read exactly what it does" about code that exists today, and avoids rating claims.
- AGPL overreach. The AGPL doesn't forbid charging, so the copy says nobody can make the code private, not that nobody can charge.
- `.reveal` uses `animation-timeline: view()`. Elements already work this way in `#about`, but check the new items fade in and aren't stuck invisible.
- Renumbering: the `02` label on `#help` must change, or the page shows two `02`s.
- The nav gains a third link. Check the header still fits at `md` width next to the theme toggle.

## Proof

- Check script (scratch): parses `index.html` and asserts criteria 1 to 5: section id and position, label numbers, nav link, exact copy, no em dash in the section, and for every `<a target="_blank">` element (whole element, not per line) `rel="noopener"` plus "opens in a new tab" or "opens a form" inside it. Must fail on `main` for the new-section assertions and pass after.
- Measured on `main` (2026-11-17), for the "phrase absent" and link assertions:
  - `grep -c $'\u2014' site/public/index.html` gives `0`, so a no-em-dash assertion on the whole file holds today.
  - `grep -c 'id="open-source"' site/public/index.html` gives `0`.
  - A per-line grep of `target="_blank"` lines without "opens in a new tab" finds 2 (the Tally button, whose hidden text is "opens a form", and the GitHub icon, whose hidden text is on a later line). So the link check must read whole `<a>` elements and accept the Tally button's wording.
- Red run of the check on `origin/main`'s `site/public/index.html` (2026-11-17). The new-section assertions fail, and the link check passes with all 5 `target="_blank"` links on main, the Tally button included:

  ```
  FAIL  #open-source section exists
  FAIL  #open-source has aria-labelledby="open-source-title"
  FAIL  #open-source sits between #about and #help  [about=11059 open-source=undefined help=12862]
  FAIL  #open-source label is "02 · Open source"
  FAIL  #open-source h2 is "Built in the open"  [no h2#open-source-title]
  FAIL  #open-source has one h2 and three h3s
  FAIL  #help label is "03 · Get involved"
  FAIL  no "02 · Get involved" label remains
  FAIL  nav links are #about, #open-source, #help in order  [#about,#help]
  FAIL  nav link text is "Open source"
  FAIL  nav link is hidden below md (max-md:hidden)
  FAIL  #open-source text is exactly the plan's copy  [section missing]
  PASS  no em dash anywhere in index.html
  FAIL  #open-source text does not mention GitHub or Tally
  FAIL  "It can't be locked up" item exists
  FAIL  it says a copy can't present itself as OPEN
  FAIL  it links to LICENSING.md
  FAIL  "Anyone can check the work" links to https://github.com/openpickleball
  PASS  every target="_blank" link has rel=noopener and new-tab text (5 links)
  FAIL  #open-source has 2 external links, each opening in a new tab  [0 external links]

  2 passed, 18 failed
  ```

- The same check on the changed file: 20 passed, 0 failed (7 `target="_blank"` links).
- After the review copy changes (see Decisions), the check's expected copy was updated first. Against the previous markup it failed only "#open-source text is exactly the plan's copy" (19 passed, 1 failed), and it passed 20 of 20 after the markup changed.
- Note (issue #52): the check output above is the record from issue #23 and stays as it ran. Anyone rerunning the check should now expect the label "02 · Open-source", the nav link text "Open-source", and "You already use open-source every day" in the copy.
- `pnpm build` in `site/`.
- Live drive (criteria 2, 6, 7): screenshots of the section in black and ivory, with reduced motion emulated, at 375px and 1440px; `document.documentElement.scrollWidth <= innerWidth` at 375px; headings outline; the nav link scrolls to the section; tab order reaches both new links.

## Decisions

- The explainer lives on openpb.org as a section between "What we stand for" and "Get involved" (user, 2026-11-17).
- No mention of outside services that aren't open source, such as GitHub hosting or Tally (user, 2026-11-17).
- One line on the trademark, linking to `LICENSING.md` (user, 2026-11-17).
- Scope: `frontend`, `backend` and `engine` are public under AGPL, and `rating-spec` is CC BY 4.0, so "all of OPEN's code is public" is true. The rating method still isn't described, per `plans/site-content-v2/`.
- The draft's "No single owner" and "Your data stays yours" points are left out because "What we stand for" already makes both promises, right above.
- The draft's "built on open source" point (SvelteKit, Tailwind, Node.js, OFL fonts) is left out as developer detail. The font licenses are recorded in `site/public/assets/fonts/OFL-*.txt` if it's wanted later.
- The examples are a single sentence, not a list, to keep the section short. Linux and Blender are dropped because players are less likely to know them.
- The draft said nobody can "start charging for it". The AGPL doesn't prevent charging, so the copy says nobody can make the code private.
- The check script's anchor regex now accepts a closing tag split across lines (`</a` then a newline and `>`), which this file uses. The first version matched only a literal `</a>`, so on `main` it checked 4 of the 5 `target="_blank"` links and missed the Tally button. The user approved the rewrite (2026-11-17).
- The two links in the section are plain underlined text links (`mt-4 inline-block text-secondary underline underline-offset-4 hover:text-muted` plus the focus classes), with no `arrow-link` arrow. With `arrow-link`, "Licensing and trademark" pushed its arrow to the far edge of the column when it wrapped at 768px. Adding `whitespace-nowrap` fixed that but overflowed the column with enlarged text (about 415px in a 335px column at 375px with text at 200%). Plain links can wrap, and "→" is no longer part of their accessible names. `inline-block` is there so `mt-4` applies (user, 2026-11-17).
- This section puts two GitHub links in the body, "See the code" and "Licensing and trademark". That is an exception to the Decisions in `plans/site-content-v2/` that keep GitHub links in the footer and the license to one footer line. The section is about public code and its license, so it links to both (user, 2026-11-17).
- Copy changes after review (user, 2026-11-17):
  - "so nothing about how it works is hidden" became "so anyone can read exactly what it does". Right under the rating promises, players could read "how it works" as the rating method, which has no published spec yet.
  - The three item headings lost their trailing periods, to match the `#about` pillar headings.
  - "A copy can't present itself as OPEN, though." became "A copy can't present itself as OPEN."
  - The closing line ("In short, open source turns ...") was removed.
- Visible text spells the term "open-source", with a hyphen, as noun and adjective. The nav link, the section label and "You already use open-source every day" changed to match "Open-source software publishes it". Ids and anchors such as `#open-source` are unchanged (user, 2026-11-17, issue #52).
