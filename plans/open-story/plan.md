# Tell the OPEN story on openpb.org (issue #309)

**Status:** active

Risk tier: Medium. Copy and a small layout change on one static page that deploys to openpb.org on merge. There are no automated tests for `site/`, so the change is proven by the build and by looking at the page in both themes, with reduced motion, at four widths.

Domain skills: impeccable and frontend-design, not applicable because the change adds copy inside the existing visual system and adds no new design. humanizer, invoke on the new copy before it is final. chrome-devtools-mcp, invoke for the live drive (screenshots at each width and theme, reduced motion emulation). All other listed skills (Django, Expo, React, Celery, API, auth, payments, email) are not applicable because the change is a static HTML page.

## Goal

The home page tells visitors who builds OPEN (volunteers, not a company), why a rating matters, how OPEN will earn trust in its accuracy, and what OPEN needs now (board members, and match results from organizers and apps). It speaks to everyday players and turns no player away. Every new line is true today or a promise worded with "will".

## Acceptance criteria

1. Each line of new copy answers a row of the frustrations table in issue #309.
2. The copy speaks to everyday players and turns no player away. One audience line is on the page: "It's a rating for every player, from your first open play to your first tournament."
3. All six changes from the issue are in `site/public/index.html`:
   1. A vision line under the About headline, and a new About intro that says OPEN is free, built by volunteers, not a company, and why a rating matters.
   2. "Every dollar in and out is public." ends the Community-driven pillar, linked to `https://opencollective.com/open-pickleball` in a new tab. The footer link stays.
   3. A fourth pillar, "Proven first".
   4. Get involved is rewritten around two asks (board, match results), keeps the one Tally button, and shows `info@openpb.org` next to it as a `mailto:` link.
   5. The Transparent pillar says changes to how ratings work will be proposed and discussed in public.
   6. The Free pillar says one free rating will work for any club, league or app.
4. The page is checked in both themes (black and ivory) and with reduced motion, at 320px, 375px, 768px and desktop widths. Nothing overlaps, overflows or clips. The four pillars lay out as one column below `md`, two columns from `md`, four from `lg`.
5. `plans/site-content-v2/plan.md` Decisions record the reversals (fourth pillar, Get involved role list, one standard), the audience decision, and the new wording.
6. New copy has no emojis and no em dashes, says "player", "match" and "organizer", names no external rating system, does not describe the rating method or the 2.0 to 8.0 scale, and labels nothing as an OPEN rating.
7. The Tally form `Kp50eD` covers the board and match-results asks. This is a form change in Tally, outside the repo, done by a maintainer (see Risks).
8. `pnpm build` in `site/` succeeds.

## Copy

About, under the headline "A rating that belongs to the players":

> A rating built by players, checked by anyone, owned by no one.

> OPEN, the Open Pickleball Evaluation Network, is a free pickleball rating system built by volunteers. It's not a company, and there's nothing to sell. Your rating decides which events you can enter and who you play with, so you should be able to see how it works. It's a rating for every player, from your first open play to your first tournament.

Pillars, in this order:

- **Free.** No subscriptions, paid upgrades, or ads. Players are never asked for money, in the app or at events. One free rating that any club, league or app will be able to use.
- **Transparent.** After every match, you'll be able to see what changed your rating and why. Any change to how ratings work will be proposed and discussed in public, and anyone can comment.
- **Community-driven.** No company, sponsor, or individual will ever own OPEN or sway ratings. Your ratings and match history are always yours to download. [Every dollar in and out is public.]
- **Proven first.** Before anyone relies on an OPEN rating, we'll test it on real matches and publish how accurate it is.

Get involved:

> **Be part of it from the start** (unchanged headline)
>
> OPEN is being built right now, by players, for players. The people who join early will shape what it becomes.
>
> - **Help run OPEN.** We're looking for people to serve on OPEN's first board: players, club and event organizers, developers, and people who know ratings or statistics. The first board will be nominated in public, with 30 days for anyone to comment.
> - **Share match results.** Before any OPEN rating goes live, we need real match results to test it. If you organize events or run a pickleball app, we'd like to talk.
>
> [Get involved] or email info@openpb.org

Sources: `site/public/funding.json` ("a volunteer, community-governed group", "A rating decides which events a player can enter", "Every change goes through a public request for comments", "every dollar in and out is published on Open Collective"), `ROADMAP.md` (shadow-mode testing and published validation before ratings go live, the ratings and stats API under "Next"), `GOVERNANCE.md` (five-seat board seated before any rating goes live, seats for players, clubs and organizers, developers, and rating or statistics expertise, public nomination with 30 days of comment).

## Files that change

- `site/public/index.html`: About intro and vision line, the pillar list (fourth item, grid `md:grid-cols-2 lg:grid-cols-4`), the Free, Transparent and Community-driven text, and the Get involved section.
- `site/src/input.css`: only if a style the new markup needs has no Tailwind default or token. Expected: no change.
- `plans/site-content-v2/plan.md`: new Decisions entries (see Order of work step 4).
- `plans/open-story/plan.md`: this plan. Tick steps, set status to done.
- `site/AGENTS.md`: only if its description of the page becomes wrong. The About and Get involved summaries there stay true, so expected: no change.

## Order of work

1. About: add the vision line as a paragraph between the `h2` and the intro, styled like the intro but in `text-secondary` so it reads as the lead. Replace the intro text. Keep `#about`, `tabindex="-1"` and the `reveal` classes.
2. Pillars: update the three existing pillar texts, add the Proven first `li` with the same classes, and change the grid to `md:grid-cols-2 lg:grid-cols-4`. The Open Collective link uses the same classes and `target="_blank" rel="noopener"` plus `<span class="sr-only"> (opens in a new tab)</span>` as the other in-body links (see the "See the code" link), but inline in the paragraph (`underline underline-offset-4 text-secondary hover:text-muted` plus the focus classes).
3. Get involved: replace the intro paragraph, add a `ul` with the two asks (each a `li` whose lead-in is a `strong` in `text-secondary`), keep the Tally `a` unchanged, and add the email beside it in a wrapping flex row (`flex flex-wrap items-center gap-x-6 gap-y-3`), as a `mailto:` link styled like the body links. Use only Tailwind default steps and the existing `clamp()` sizes already in the section.
4. Decisions: in `plans/site-content-v2/plan.md`, add one entry per reversal (fourth pillar Proven first, Get involved role list, one standard as a Free pillar line), one for the audience decision (everyday players, exclude no one, "the 99%" stays off the page, the line chosen and where), and one for the new About and Get involved wording. Mark the earlier entries as reversed by referencing frontend#309 rather than deleting them, as the frontend#281 entry does.
5. Build and live drive (see Proof).

## Risks

- Four columns at `lg` (1024px) are narrow. If "Community-driven" or the longer pillar texts look cramped, move the four-column step to `xl` and record why. No custom breakpoint.
- The Tally form lacks a board option and a match-results option today (page 1 has "Which best describes you?" and "How would you like to be involved?" with no board or match-data choice). Nobody in this run has Tally access, so the PR says the form must be updated before merge and leaves criterion 7 unchecked for a maintainer.
- "Built by players" could read as "only players build it". The About intro says "built by volunteers" right after it, and Get involved names developers and statisticians, so the page doesn't claim that.
- The board line must not promise a seat. It says "We're looking for people", and the public nomination sentence makes clear the form is not an application that grants one.
- The match-results item must not ask players to log matches, because the app is not deployed. It asks organizers and apps only.
- The site deploys on merge, so a copy mistake goes live. A human reviews the PR.

What we chose not to do: no hero change (the teaser is fitted to the render and stays one line), no change to the open-source explainer's length (the issue names it as a problem but proposes no change), no change to `meta` descriptions, and no copy about the rating method.

## Proof

No automated tests cover `site/`. Each criterion is proven as follows:

- Criteria 1, 2, 3, 6: read the rendered page text against the frustrations table and the six changes. A grep for em dashes (U+2014) and emoji in the changed lines of `site/public/index.html` returns nothing. A grep for "rating system" names no external system.
- Criterion 4: live drive with `site` from `.claude/launch.json` (serve `site/public/` on port 4173): screenshots of About and Get involved at 320, 375, 768 and 1440 wide, in black and ivory, and once with reduced motion emulated (sections visible, standing still). The Open Collective link and email link open the right targets. The Get involved button still opens the Tally popup.
- Criterion 5: the diff of `plans/site-content-v2/plan.md`.
- Criterion 8: `pnpm build` output.

Run on this branch:

- Before the edit, a check script (`grep` on whitespace-collapsed `site/public/index.html` for each new line, the new grid classes, two `opencollective.com` links and two `mailto:` links) failed 13 checks. After the edit all 15 pass (two wrapped-text checks became one).
- `pnpm build` in `site/`: Tailwind v4.3.5, "Done", exit 0. A grep for the em dash character in the added lines of `site/public/index.html` (against `origin/main`) prints nothing, and no added line in either changed file has an en dash, em dash or emoji.
- Live drive (Chrome DevTools, `site/public/` on port 4173), black and ivory at 320, 375, 768, 1024 and 1440: `scrollWidth` never exceeds the window, no pillar overlaps another, nothing in About or Get involved sits outside the window, and the only clipped elements are the `sr-only` labels. The pillar grid has 1 column at 320 and 375, 2 at 768, and 4 at 1024 and 1440. At 1024 each pillar is 202px wide, "Community-driven" stays on one line and no word breaks, so the four-column step stays at `lg`. The button and the email sit side by side from 768 and stack below it.
- Reduced motion (375, black): no running animations, and every `.reveal` in About and Get involved is at opacity 1 with no transform before any scroll.
- Review fix: the Get involved row (button and email) carries the one `reveal`. Before the fix a check (`grep` for `reveal` on the row wrapper and none on the Tally link) failed both lines, and after it both pass. In the browser, with motion allowed at 375 and 1024 (black), the row runs the only `reveal` animation and neither child has its own. Midway through, the row is at opacity 0.39 and both children fade with it. With reduced motion the row and both children are at opacity 1, and nothing is animating.
- The Open Collective link goes to `https://opencollective.com/open-pickleball` with `target="_blank" rel="noopener"`, the email link is `mailto:info@openpb.org`, and clicking "Get involved" opens the Tally popup (`tally.so/popup/Kp50eD`, `hideTitle=1`) on the page.

## Steps

- [x] About vision line and intro
- [x] Pillars: copy, fourth pillar, grid
- [x] Get involved rewrite with email
- [x] Decisions in `plans/site-content-v2/plan.md`
- [x] Build and live drive
- [ ] Tally form updated (maintainer, outside the repo)

## Decisions

- This plan lives in `plans/open-story/` because the repo has no `.claude/work-issue.md` and keeps plans under `plans/`.
- The Tally link's `mt-9` and `reveal` moved to the new flex row that holds the button and the email. The row keeps the same space above it, and the button and the email fade in together as one block. The link is otherwise unchanged.
