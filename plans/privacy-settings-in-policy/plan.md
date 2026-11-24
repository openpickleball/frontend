# Plan: Name every privacy setting in the Privacy Policy (issue #199)

**Status:** active

Risk tier: Medium. One static page and no code, but the page makes promises to players, it changes text that is already live, and merging deploys it to openpb.org.

Domain skills: humanizer: invoke, for the new sentences. frontend-design, impeccable: not applicable because no styles or layout change. chrome-devtools-mcp:a11y-debugging: not applicable because no new markup patterns, only list items in the existing `legal` body. Backend and framework skills (django, allauth, Svelte): not applicable because nothing outside `site/public/privacy/` changes.

## Goal

Most of #199 shipped already. #202 (for #201) published `/privacy/` and linked it from the site footer. #203 (for #198) linked Privacy from the app footer and from the signup line under Create account. One acceptance criterion is still not met: "Every field the signup form and profile collect is named on the page, with the reason we collect it."

The profile's "Name and privacy" section has five switches (`app/src/lib/features/players/settings.ts`, `PRIVACY_ROWS`): Match history, Stats, Rating history, Home club, and City and region. The backend stores all five (`players.PlayerPrivacy` in the backend's `docs/privacy/personal-data-inventory.md`). The policy names only match history and city and region. This PR names all five.

## Decisions

- Project owner, 2026-11-24: fix the gap in one PR that closes #199. The PR body says the owner sign-off and the legal review before launch are still open tasks for a person.
- What each setting does today, from the backend at origin/main 8e6874f: only `match_history_visibility` and `city_region_visibility` are read when another player views a profile (`apps/players/api.py`). For stats, rating history and home club, their settings are stored, but OPEN keeps no stats, rating history or home club data. Home club is planned (#157), and no OPEN rating is published.
- Project owner, 2026-11-24, wording: "Your choices" says, verbatim, "OPEN doesn't keep stats, a rating history or a home club for you yet. Those three settings are saved, but they don't change anything today. Anyone who can see your match history can work out your wins and losses from it." This replaces an earlier draft that said OPEN doesn't show those three to other players yet and that the settings will apply once it does, which implied OPEN holds that data. The "What OPEN records" item names the five settings without saying who can see the data. The item goes after "They don't hide you in other players' match histories", so that item's "They" still follows the first item about the settings.
- The policy's own "Changes to this policy" section promises a new version number and date for each change. So the page moves to "Version 2 · Effective November 24, 2026". If the PR merges later, the reviewer updates the date. No email is owed: player accounts are not open yet.
- Not changed: the who-can-see list. Stats, rating history and home club are not stored as separate data items today, so there is nothing to add there.

## Acceptance criteria

1. `site/public/privacy/index.html` names all five privacy settings, using the app's labels in lower case: match history, stats, rating history, home club, and city and region. They appear in "What OPEN records" and in "Your choices".
2. "Your choices" says, in the owner's words, that OPEN doesn't keep stats, a rating history or a home club for you yet, that those three settings are saved but change nothing today, and that anyone who can see your match history can work out your wins and losses from it.
3. The page shows "Version 2 · Effective November 24, 2026".
4. Nothing else on the page changes meaning. No em dashes, no emojis, no "user", no named competing rating system, and no claim that an OPEN rating is live.
5. `pnpm build` in `site/` passes, and the page reads clearly in the black and ivory themes and with reduced motion.

## Files that change

- `site/public/privacy/index.html`: the "What OPEN records" item about privacy settings, the first item of "Your choices" plus one new item after the "They don't hide you" item, and the version line.
- `plans/privacy-settings-in-policy/plan.md`: this plan.

No doc changes are expected: `site/AGENTS.md` already says the policy follows the inventory.

## Order of work

1. Write the proof script in the scratch directory (see Proof). Run it against the unchanged page and keep the red output.
2. Edit `site/public/privacy/index.html`:
   - "What OPEN records": `<li>Your privacy settings.</li>` becomes an item that names the five settings: one each for match history, stats, rating history, home club, and city and region.
   - "Your choices", first item: the settings choose who sees your own match history and your city and region, and there are settings for stats, rating history and home club too. Keep the existing defaults sentence ("signed-in players", or "only you" for players aged 13 to 17).
   - A new item right after the "They don't hide you in other players' match histories" item: the owner's sentence from Decisions, verbatim.
   - Version line: "Version 2 · Effective November 24, 2026".
3. Run the proof script (green), `pnpm build` in `site/`, and the live drive.
4. Commit the page change with a body that explains why.

## Risks

- A promise that isn't true. Each new sentence traces to `PRIVACY_ROWS`, the backend's `PlayerPrivacy` model and `apps/players/api.py`, or the inventory. "Doesn't keep ... yet" must stay true: if #157 or ratings ship first, this text is out of date.
- The 13 to 17 default. The policy already says the settings start at "only you" for players aged 13 to 17. That sentence now covers five settings. The backend's `apps/players/services.py` lines 92 to 94 back it: `create_player` sets all five to PRIVATE for a minor. The verifier checks this against the backend.
- Version drift. The Terms don't cite the policy's version, so nothing else needs bumping. The verifier confirms with a grep.

## Proof

- Criteria 1 to 4: a proof script in the scratch directory that greps `site/public/privacy/index.html` for each of the five settings inside "What OPEN records" and "Your choices", the "yet" sentence, the Version 2 line, and checks no em dash (U+2014) and no "user" word. It must fail on the unchanged page before the edit.
- Criterion 5: `pnpm build` output. Live drive (Medium): serve `site/public/`, open `/privacy/` in black and ivory and with reduced motion emulated, and confirm the new items and the version line render and the footer links still work.
- Measured on origin/main 06462e3: `grep -ciE 'stats' site/public/privacy/index.html` prints 0, and the same for `rating history` and `home club`. `grep -n Version site/public/privacy/index.html` prints `Version 1 · Effective November 23, 2026`. So a check for those phrases fails today.
