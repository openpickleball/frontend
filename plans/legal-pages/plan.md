# Plan: Publish Terms of Service and Privacy Policy pages on openpb.org (issue #201)

**Status:** active

Risk tier: Medium. Static HTML and CSS only, but the pages make legal promises to players, deploy to openpb.org on merge, and touch more than a few files.

Domain skills: humanizer: invoke, for the plain-language copy. frontend-design: not applicable because the pages reuse the existing site styles. impeccable: not applicable, no new visual direction. chrome-devtools-mcp:a11y-debugging: invoke during the live drive (headings, link names, contrast in both themes). Backend and framework skills (django, allauth): not applicable because nothing in the backend changes.

## Goal

openpb.org has a Terms of Service page and a Privacy Policy page, each with a version and effective date, linked from the footer. Signup (frontend#197) can then link to them from its agreement checkboxes.

## Decisions

- The issue asked for text written by a person. The project owner told Claude to write it (2026-11-23). The PR says so, so the human reviewer reads the legal text before merging.
- The party players agree with is "OPEN (Open Pickleball Evaluation Network), a volunteer project run by its interim steward until the governing board is seated" (GOVERNANCE.md). No personal name. Contact: info@openpb.org.
- No governing law or venue clause until OPEN has a legal entity (project owner, 2026-11-23).
- One policy covers openpb.org today and OPEN player accounts, with a plain note at the top of each page that player accounts are not open yet (project owner, 2026-11-23). It includes the Photon location search at signup (backend#221 decision) as the issue asks.
- The Privacy Policy follows `backend/docs/privacy/personal-data-inventory.md` at backend commit f6d4aa5. Where the inventory leaves a decision to a later issue (account deletion #116, data export #39, partner sharing #32), the policy says what happens today and that the policy will change before that does.
- The pages have the theme toggle at the top right, as on `/` (project owner, 2026-11-23). The toggle script moves out of `index.html` into `public/assets/js/theme-toggle.js`, so the three pages share one copy. Each page keeps the head script that applies a stored choice before first paint. The shared script also re-reads the stored choice on `pageshow` when a page comes back from the back-forward cache, because the choice may have changed on another page (review finding, 2026-11-23).
- Names follow backend#221's decision (project owner, 2026-11-23): signup asks first and last name, stores "First Last" as the legal name and uses it as the starting display name, which the player can change later.
- Account deletion is not built (#116), and an Account with a Player cannot be deleted today. Both pages say to email us and we deactivate the account. The policy lists what stays once deletion ships, and says it will change before full deletion is available.
- The policy also covers organizer data (an organizer's name, organizer and club roles, events, verification, a partner app's owner account), since the inventory lists it.
- Photon is presented apart from the companies that handle data for OPEN: komoot runs it as a public service under its own privacy policy.
- The Terms and the Privacy Policy cover openpb.org and the OPEN app (it will be at app.openpb.org). Sections about accounts start with a line saying they apply once player accounts open.
- No motion. The pages use no `.reveal` or scroll animation, so reduced motion has nothing to turn off.

## Acceptance criteria

1. `site/public/terms/index.html` and `site/public/privacy/index.html` exist, so the pages serve at `/terms/` and `/privacy/`. Each shows a visible version number and effective date near its title.
2. Both pages use `src/input.css` and its color tokens (no hex values in the markup), apply a stored theme choice before first paint, have the theme toggle, and read clearly in the black and the ivory theme. The toggle on `/` works as before.
3. The footer bottom bar on `/` links to both pages ("Terms" and "Privacy"). Each legal page links home and to the other page.
4. The Privacy Policy covers: openpb.org hosting (GitHub Pages), the theme setting in local storage, the Tally interest form and its script; and for accounts, every inventory field a player provides or creates (email, password hash, birth month and year, gender division, display name and legal name, city and region, privacy settings, matches, match participants, scores, confirmations and disputes, sessions), the email provider (Resend), hosting (DigitalOcean), the Photon location search (what is sent, and that only city and region are stored), who can see each item, the 13-and-older rule and the protections for players aged 13 to 17, what OPEN never collects, retention, and how to ask for a copy or deletion.
5. Both pages: plain language for players, short sentences, no emojis, no em dashes, no named competing rating systems, no claim that an OPEN rating is live, and a note that player accounts are not open yet.
6. The Terms name OPEN through its interim steward, with no personal name and no governing law clause.
7. `pnpm build` in `site/` passes, and the new pages' classes are in the built CSS.

## Files that change

- `site/public/terms/index.html` (new): Terms of Service.
- `site/public/privacy/index.html` (new): Privacy Policy.
- `site/src/input.css`: a `legal` utility that styles headings, paragraphs, lists and links inside the policy body, so the long text needs no class on every element.
- `site/public/index.html`: two links in the footer bottom bar, and the toggle script replaced by a `<script src>` for the shared file.
- `site/public/assets/js/theme-toggle.js` (new): the toggle script from `index.html`, plus a `pageshow` handler for pages restored from the back-forward cache.
- `site/AGENTS.md`: describe the two pages, and that the Privacy Policy must change when the backend inventory changes what it says.
- `plans/legal-pages/plan.md`: this plan.

## Order of work

1. Move the toggle script into `public/assets/js/theme-toggle.js` and load it from `index.html`. Check the toggle on `/` still flips, saves, and updates its label, and that Back to a cached page shows the current choice.
2. Add the `legal` utility to `src/input.css`.
3. Write `privacy/index.html`: head copied from `404.html`'s pattern (charset, viewport, title, description, canonical, theme-color, icons, font preloads, theme script, stylesheet, no Tally script), a short header (logo linking home, and the theme toggle), the title, version and date, the accounts-not-open note, the body, and a footer bottom bar with the same links as `/` plus Terms and Privacy.
4. Write `terms/index.html` the same way.
5. Add the Terms and Privacy links to the footer bottom bar in `index.html`.
6. `pnpm build`, then the checks in Proof.

## Risks

- Legal promises that are not true. Every claim in the policy traces to the inventory, an ADR, the site source, or a decision above. Promises about features not built yet (export, self-serve deletion) are worded as "email us" today.
- The inventory moves. backend#221 will add first and last name at signup. The policy already covers names (display name and legal name exist today). `site/AGENTS.md` says to update the policy with the inventory.
- The effective date is the date written, not the merge date. If the PR merges later, the reviewer updates the date in both pages.
- Text is not legal advice. The PR asks for a human read before merge.

## Proof

- Criterion 1, 3: `ls site/public/terms site/public/privacy`; in a browser, follow each footer link from `/` and each cross-link.
- Criterion 2: the toggle flips the theme on `/`, `/terms/` and `/privacy/`, and the choice carries between them. `grep -nE '#[0-9a-fA-F]{6}' site/public/{terms,privacy}/index.html` finds only the theme-color meta values; screenshots of both pages in both themes.
- Criterion 4: a checklist walk of the inventory rows against the policy text (verifier).
- Criterion 5: `grep -nP '\x{2014}' site/public/{terms,privacy}/index.html` finds nothing; grep for "OPEN rating" shows no claim one is live.
- Criterion 7: `pnpm build` output; `grep -c legal site/public/assets/css/main.css`.
- Live drive (Medium): serve `site/public/`, open `/`, `/terms/`, `/privacy/` in both themes and with reduced motion emulated, check headings and links with the a11y skill.
