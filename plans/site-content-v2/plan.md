# Simpler, plainer home page

**Status:** done

## Goal

The home page at openpb.org says only what is true today, in words a non-technical player understands. It has two sections: what OPEN stands for, and how to follow along or help. (A third section, Open source, was added later by `plans/open-source-explainer/`.) It drops content that runs ahead of the project: the rating method, the roadmap, the governance status, and graphics for data, standards or algorithms that don't exist yet. Every link that leaves the site opens in a new tab.

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

- Interest and update opt-ins go through one Tally form (`Kp50eD`), which is friendlier than GitHub for older players. The Get involved section has only that button. GitHub links live in the footer, for contact, bug reports and developers, so visitors never have to choose between two forms. The Open source section is an exception, with two body links to the code and its license (see `plans/open-source-explainer/`).
- The merged About and Promises section was first called "What we stand for" (nav label and `01 · What we stand for` eyebrow). This is reversed: see the last decision below. It keeps the `#about` id so "Learn more", the skip link, the scroll animation and the `/about/` redirect keep working. It covers both the old sections, and it reads warmer than "About".
- What we stand for has three pillars, each with one title: Free, Transparent and Community-driven. Portable is folded into Community-driven ("Your ratings and match history are yours to download any time"). One standard is dropped because it doesn't mean much to players yet. The charter link is dropped because it sends players to GitHub. "Including the founder" is dropped.
- OPEN is described as "a free pickleball rating system", plain wording that doesn't name or compare itself to any other system. The site says "community-driven", not "community-run".
- What we stand for has no status line. The early-stage message lives only in the Get involved intro.
- Get involved is a short intro and one button. The form explains itself, so there's no role list or fine print.
- The 2.0 to 8.0 scale isn't mentioned, in the text or as a graphic, until the rating spec defines it.
- info@openpb.org is shown in the footer's Contact column as the general contact address, next to the GitHub "Contact us or report a problem" link.
- How it works is removed until the rating spec is published. The engine README calls the engine a demonstration, and there is no spec.
- The roadmap is removed from the site. ROADMAP.md in the .github repo stays the source.
- The governance status is not shown on the site for now. The value copy uses "will" so it doesn't claim community control exists today.
- The license paragraph becomes one line in a footer bar. The source link stays visible because the consolidation plan treats it as the AGPL source link. The Open source section added later also explains the license in the body (see `plans/open-source-explainer/`).
- Reversal (frontend#281): the nav link is "About" and the section has no numbered kicker. The numbers ("01", "02", "03") suggested an order that is not there, and the headline and the nav already say what each section is. "What we stand for" was chosen because it read warmer than "About". With the kicker gone, the headline "A rating that belongs to the players" carries that warmth, so the nav can use the short, familiar word. The `#about` id stays. The nav shows only "Get involved" below `md`: with all three links at 375px and 320px, "Open-source" and "Get involved" wrap onto two lines and, at 320px, run under the theme toggle. The `label` style now uses the body face, and the display face (Krona One) is only for the OPEN wordmark (frontend#280).
