# Simpler, plainer home page

**Status:** done

## Goal

The home page at openpb.org says only what is true today, in words a non-technical player understands. It has two sections: what OPEN stands for, and how to follow along or help. (A third section, Open source, was added later by `plans/open-source-explainer/`.) It drops content that runs ahead of the project: the rating method, the roadmap, the governance status, and graphics for data, standards or algorithms that don't exist yet. (frontend#309 later brought back two roadmap commitments, testing ratings before they go live and seating the first board, as plain promises, without the roadmap itself.) Every link that leaves the site opens in a new tab.

The copy prototype, `design/content-v2.html`, was deleted once the plan was done. It is in git history.

## Steps

All four PRs change `site/public/index.html`, so land them one after another, not in parallel.

- [x] Align on the prototype copy and answer the open questions.
- [x] **PR 1, removals:** delete `#how` (sample court, factor list, calibration chart, validation list) and `rating-sketch.js`, the about ruler graphic, the "Where that stands today" block, and `#roadmap`. Add `target="_blank" rel="noopener"` and a visually hidden "(opens in a new tab)" to every external link. Update the header nav and `site/AGENTS.md`.
- [x] **PR 2, What we stand for:** merge `#about` and `#promises` into one numbered section using the approved copy.
- [x] **PR 3, Get involved:** merge `#roadmap` and `#help` into one section with a single "Get involved" button. The button opens the Tally interest form `Kp50eD` as a popup. It is a link to `https://tally.so/r/Kp50eD` (new tab) with `data-tally-form="Kp50eD"`. A small script in `index.html` calls `Tally.openPopup` once `https://tally.so/widgets/embed.js` has loaded, and otherwise the link opens the form in a new tab. Check that the modal follows the ivory and black themes well enough.
- [x] **PR 4, footer:** brand and tagline, a Follow us row of icons, Contact, and a one-line legal bar. Drop the Documents column.

## Follow-ups

- Bring How it works back once the rating spec is published, either from git history or as a new design. Start a new plan for it.

## Decisions

- Interest and update opt-ins go through one Tally form (`Kp50eD`), which is friendlier than GitHub for older players. The Get involved section has only that button. GitHub links live in the footer, for contact, bug reports and developers, so visitors never have to choose between two forms. The Open source section is an exception, with two body links to the code and its license (see `plans/open-source-explainer/`). Partly reversed by frontend#309: an info@openpb.org email link now sits beside the button.
- The merged About and Promises section was first called "What we stand for" (nav label and `01 · What we stand for` eyebrow). This is reversed: see the last decision below. It keeps the `#about` id so "Learn more", the skip link, the scroll animation and the `/about/` redirect keep working. It covers both the old sections, and it reads warmer than "About".
- What we stand for has three pillars, each with one title: Free, Transparent and Community-driven. Portable is folded into Community-driven ("Your ratings and match history are yours to download any time"). One standard is dropped because it doesn't mean much to players yet. The charter link is dropped because it sends players to GitHub. "Including the founder" is dropped. Partly reversed by frontend#309: see the fourth pillar and one standard decisions below.
- OPEN is described as "a free pickleball rating system", plain wording that doesn't name or compare itself to any other system. The site says "community-driven", not "community-run".
- What we stand for has no status line. The early-stage message lives only in the Get involved intro. Partly reversed by frontend#309: the Proven first pillar says ratings will be tested before anyone relies on them.
- Get involved is a short intro and one button. The form explains itself, so there's no role list or fine print. Reversed by frontend#309: see the Get involved decision below.
- The 2.0 to 8.0 scale isn't mentioned, in the text or as a graphic, until the rating spec defines it.
- info@openpb.org is shown in the footer's Contact column as the general contact address, next to the GitHub "Contact us or report a problem" link.
- How it works is removed until the rating spec is published. The engine README calls the engine a demonstration, and there is no spec.
- The roadmap is removed from the site. ROADMAP.md in the .github repo stays the source.
- The governance status is not shown on the site for now. The value copy uses "will" so it doesn't claim community control exists today. Partly reversed by frontend#309: the Get involved board ask says the first board will be nominated in public.
- The license paragraph becomes one line in a footer bar. The source link stays visible because the consolidation plan treats it as the AGPL source link. The Open source section added later also explains the license in the body (see `plans/open-source-explainer/`).
- Reversal (frontend#281): the nav link is "About" and the section has no numbered kicker. The numbers ("01", "02", "03") suggested an order that is not there, and the headline and the nav already say what each section is. "What we stand for" was chosen because it read warmer than "About". With the kicker gone, the headline "A rating that belongs to the players" carries that warmth, so the nav can use the short, familiar word. The `#about` id stays. The nav shows only "Get involved" below `md`: with all three links at 375px and 320px, "Open-source" and "Get involved" wrap onto two lines and, at 320px, run under the theme toggle. The `label` style now uses the body face, and the display face (Krona One) is only for the OPEN wordmark (frontend#280).
- Reversal (frontend#309): About has a fourth pillar, "Proven first": "Before anyone relies on an OPEN rating, we'll test it on real matches and publish how accurate it is." Players asked why they should trust a new rating, and the roadmap already promises shadow-mode testing and published accuracy before ratings go live. The pillar grid is one column below `md`, two from `md` and four from `lg`.
- Reversal (frontend#309): one standard comes back, as a line in the Free pillar rather than a pillar of its own: "One free rating that any club, league or app will be able to use." It is worded with "will" because no club, league or app uses OPEN yet.
- Reversal (frontend#309): Get involved names two asks, "Help run OPEN" (OPEN's first board, nominated in public with 30 days for comment) and "Share match results" (organizers and apps only, since the app isn't live). It keeps the one Tally button, and shows info@openpb.org next to it as a `mailto:` link for people who would rather write. The board ask says "We're looking for people" so it doesn't promise a seat. The Tally form needs a board option and a match-results option before this goes live (a maintainer change outside the repo).
- Audience (frontend#309): the page speaks to everyday players and turns no player away. "The 99%" stays off the page, because it sets players against each other. The one audience line is the last sentence of the About intro: "It's a rating for every player, from your first open play to your first tournament."
- Wording (frontend#309): About opens with the vision line "A rating built by players, checked by anyone, owned by no one.", then an intro that says OPEN is free, built by volunteers, not a company, and why a rating matters ("Your rating decides which events you can enter and who you play with, so you should be able to see how it works."). Transparent adds "Any change to how ratings work will be proposed and discussed in public, and anyone can comment." Community-driven ends with "Every dollar in and out is public.", linked to Open Collective; the footer link stays. The Get involved intro is "OPEN is being built right now, by players, for players. The people who join early will shape what it becomes." Sources: `site/public/funding.json`, `ROADMAP.md` and `GOVERNANCE.md` (see `plans/open-story/plan.md`).
