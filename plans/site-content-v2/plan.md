# Simpler, plainer home page

**Status:** active

## Goal

The home page at openpb.org says only what is true today, in words a non-technical player understands. It has two sections: what OPEN stands for, and how to follow along or help. It drops content that runs ahead of the project: the rating method, the roadmap, the governance status, and graphics for data, standards or algorithms that don't exist yet. Every link that leaves the site opens in a new tab.

The copy prototype is `design/content-v2.html`. Serve the repo root with the `design` entry in `.claude/launch.json` and open `/design/content-v2.html`. The green notes explain each change and can be hidden.

## Steps

All four PRs change `site/public/index.html`, so land them one after another, not in parallel.

- [x] Align on the prototype copy and answer the open questions.
- [x] **PR 1, removals:** delete `#how` (sample court, factor list, calibration chart, validation list) and `rating-sketch.js`, the about ruler graphic, the "Where that stands today" block, and `#roadmap`. Add `target="_blank" rel="noopener"` and a visually hidden "(opens in a new tab)" to every external link. Update the header nav and `site/AGENTS.md`.
- [x] **PR 2, What we stand for:** merge `#about` and `#promises` into one numbered section using the approved copy.
- [ ] **PR 3, Get involved:** merge `#roadmap` and `#help` into one section with a single "Get involved" button. The button opens the Tally interest form `Kp50eD` as a modal: load `https://tally.so/widgets/embed.js` in the `<head>` and add `data-tally-open="Kp50eD" data-tally-layout="modal" data-tally-width="500"`. Make the button a link to `https://tally.so/r/Kp50eD` (new tab) so it still works without JS. Check that the modal follows the ivory and black themes well enough.
- [ ] **PR 4, footer:** brand and tagline, a Follow us row of icons, Contact, and a one-line legal bar. Drop the Documents column.
- [ ] Bring `#how` back once the rating spec is published, from git history or a new design.

## Decisions

- Interest and update opt-ins go through one Tally form (`Kp50eD`), which is friendlier than GitHub for older players. The Get involved section has only that button. GitHub links live in the footer, for contact, bug reports and developers, so visitors never have to choose between two forms.
- The merged About and Promises section is called "What we stand for" (nav label and `01 · What we stand for` eyebrow). It keeps the `#about` id so "Learn more", the skip link, the scroll animation and the `/about/` redirect keep working. It covers both the old sections, and it reads warmer than "About".
- What we stand for has three pillars, each with one title: Free, Transparent and Community-driven. Portable is folded into Community-driven ("Your ratings and match history are yours to download any time"). One standard is dropped because it doesn't mean much to players yet. The charter link is dropped because it sends players to GitHub. "Including the founder" is dropped.
- OPEN is described as "a free pickleball rating system", the usual wording (DUPR and UTR both call themselves rating systems). The site says "community-driven", not "community-run".
- What we stand for has no status line. The early-stage message lives only in the Get involved intro.
- Get involved is a short intro and one button. The form explains itself, so there's no role list or fine print.
- The 2.0 to 8.0 scale isn't mentioned, in the text or as a graphic, until the rating spec defines it.
- info@openpb.org is shown in the footer's Contact column as the general contact address, next to the GitHub "Contact us or report a problem" link.
- How it works is removed until the rating spec is published. The engine README calls the engine a demonstration, and there is no spec.
- The roadmap is removed from the site. ROADMAP.md in the .github repo stays the source.
- The governance status is not shown on the site for now. The value copy uses "will" so it doesn't claim community control exists today.
- The license paragraph becomes one line in a footer bar. The source link stays visible because the consolidation plan treats it as the AGPL source link.
