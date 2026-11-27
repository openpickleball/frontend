# Plan: Update the Terms of Service for how matches are settled now (issue #267)

**Status:** done

Risk tier: Medium. Static HTML copy only, one page, but it makes legal promises to players and deploys to openpb.org on merge.

Domain skills: humanizer: invoke, for every new or rewritten sentence. chrome-devtools-mcp:a11y-debugging: invoke during the live drive (the list and headings). frontend-design, impeccable: not applicable because no styles or layout change. Backend and framework skills (django, allauth, ninja, celery): not applicable because nothing in the backend changes.

## Goal

The Terms of Service say how a match is settled today: by its players, by its event's verified organizer, or by time. They say a player can report an organizer and what moderators can do about one, and that a player can delete their account. Every sentence traces to the backend at origin/main `928c02c`.

## Decisions

- PR #315 (#266) already replaced the false moderator line and the "not built yet" deletion line, and moved the Terms to version 2, effective November 27, 2026. This PR does the rest of #267.
- Project owner, 2026-11-27: approved this plan.
- Version: "Version 3 · Effective November 27, 2026". Version 2 went live today with #315, so a change to the text needs a new number. If the PR merges later, the reviewer updates the date. No email is owed: player accounts are not open yet. backend#345 (open) bumps `TERMS_OF_SERVICE_VERSION` to 2; the PR asks for 3 there.
- The time limits keep their numbers (30 days for a dispute, 14 days for a possible duplicate), as the Terms already say "30 days". They are the backend defaults `MATCH_DISPUTE_EXPIRY_DAYS` and `MATCH_DUPLICATE_HOLD_DAYS` (`config/settings.py`).
- Bulk voids work by submitter or upload batch (ADR 0032), and a submitter can be a player, an organizer's member or a partner app. The Terms say moderators can void "all the matches a person or app submitted", not only an organizer's.
- The app has no report button yet. The Matches section already says it applies once player accounts open, so it states the rule.
- "Your account" gets one line that points to "Ending your use" and the Privacy Policy, instead of a second copy of the deletion text.
- Review, 2026-11-27: the duplicate rule says 'marked as a real, separate match' (a vouch), not 'confirmed', and the withdrawal item says a player disputes a match only once (both finders; workflow.py). A hold also ends when either match is voided (delta finder; ADR 0034).

## Acceptance criteria

1. "Matches" in `site/public/terms/index.html` says, in plain language:
   a. a player can withdraw their dispute while the match is disputed, and withdrawing uses the player's one dispute of that match;
   b. a player can correct a match not from an event while it waits for confirmation or is disputed, keeping the same teams, and the correction counts once the other team confirms it;
   c. the event's verified organizer settles a dispute on an event match, by confirming, voiding or correcting it;
   d. a dispute nobody settles in 30 days voids the match;
   e. a possible duplicate holds both matches until each is marked as a real, separate match (vouched for by a player on each team, or the event's organizer), or until either match is voided, and the earlier match then can count; if neither happens within 14 days and the earlier match is confirmed, the newer one is voided and the earlier one can count;
   f. a player can report an event's organizer to OPEN, and a report changes no match by itself;
   g. OPEN's moderators can remove an organizer's verified status and void at once the matches a person or app submitted.
   The old line "OPEN's moderators can void the matches of a submitter that broke these terms." is gone.
2. "Your account" says a player can delete their account and links to the Privacy Policy for what stays.
3. The page shows "Version 3 · Effective November 27, 2026".
4. Nothing in the Terms contradicts the Privacy Policy (deletion, who sees disputed and held matches, moderators).
5. Plain language, short sentences, no emojis, no em dashes, no named competing rating system, no claim an OPEN rating is live, "player" and "organizer" rather than "user".
6. `pnpm build` in `site/` passes. The page reads correctly in the black and ivory themes, with reduced motion, and at 390px.

## Files that change

- `site/public/terms/index.html`: version line, "Your account", "Matches", and `id="ending"` on the "Ending your use" heading.
- `plans/terms-match-settlement/plan.md`: this plan.

No other doc changes: `site/AGENTS.md` describes the legal pages in general terms that stay true.

## Order of work

1. Write the proof script first (`<scratch>/proof.sh`, kept in the PR body, not committed): the present and absent phrases below. Run it on the branch before the edit and record that it fails.
2. Edit the version line.
3. In "Your account", add after the password items: "You can delete your account at any time. See <a href="#ending">Ending your use</a>, and the <a href="/privacy/">Privacy Policy</a> for what stays." Give the "Ending your use" heading `id="ending"`.
4. Replace the "Matches" list with:
   - Only submit matches that really happened, with the true scores.
   - The other players in a match can confirm it or dispute it. A disputed match doesn't count while it is disputed.
   - While a match is disputed, you can withdraw your dispute. You can dispute a match only once, so you can't dispute it again after you withdraw.
   - For a match that isn't from an event, the players settle it. While the match waits for confirmation or is disputed, a player in it can correct it, with the same teams. The correction counts once the other team confirms it.
   - For a match from an event, the event's verified organizer settles a dispute. It can confirm the match, void it or correct it.
   - A dispute nobody settles in 30 days voids the match.
   - If two matches look like the same match, neither counts until each one is marked as a real, separate match (by a player on each team, or by the organizer for a match from an event), or until one of them is voided. If neither happens within 14 days and the earlier match is confirmed, the newer one is voided and the earlier one can count.
   - You can report an event's organizer to OPEN, for example if it gets results wrong or ignores disputes. A report doesn't change any match by itself.
   - OPEN's moderators decide whether an organizer stays verified. They can remove an organizer's verified status. They can also void at once all the matches a person or app submitted, if those break these terms.
   - OPEN keeps a record of every change to a match.
5. Run the humanizer pass on the new sentences, then `pnpm build`, the proof script, and the live drive.

## Risks

- A promise the backend doesn't keep. Each item traces to ADR 0034 (withdrawal, correction, organizer settling, expiry, duplicates, reports), ADR 0037 (reports change nothing by themselves), ADR 0032 (bulk void by submitter or batch) and `config/settings.py` (30 and 14 days). The verifier checks each against the backend at `928c02c`.
- Too much detail makes the Terms hard to read. The duplicate rule is the most complex; it leaves out the correction-chain ordering, which a player doesn't need.
- The time limits are settings. If production changes them, the Terms must change too.
- Text is not legal advice. The PR asks for a human read before merge.

## Proof

Script `proof.sh` checks `site/public/terms/index.html` with fixed-string grep on a copy with whitespace collapsed, so a phrase wrapped across source lines still counts:

- Present (criteria 1 to 3): "Version 3 · Effective November 27, 2026", "withdraw your dispute", "with the same teams", "once the other team confirms it", "verified organizer settles a dispute", "30 days voids the match", "within 14 days", "or until one of them is voided", "the earlier one can count", "report an event's organizer", "doesn't change any match by itself", "verified status", "a person or app submitted", "delete your account at any time", `id="ending"`, "marked as a real, separate match", "You can dispute a match only once", "doesn't count while it is disputed".
- Absent: "Version 2 · Effective", "OPEN's moderators can void the matches of a submitter that broke these terms.", an em dash (`grep -P '\x{2014}'`), "user", "OPEN rating is live", "confirmed as real", "until the dispute is settled", "If that hasn't happened after 14 days".
- Measured on origin/main `3fdddf8` with `grep -cF`: "Version 2 · Effective November 27, 2026" 1, the old moderator line 1, "withdraw" 0, "14 days" 0, "report" 0, "verified status" 0, "Version 3" 0.

Criterion 4: the verifier reads both pages side by side. Criterion 6: `pnpm build` output. Live drive (Medium): serve `site/public/` and open `/terms/` in black and ivory, with reduced motion emulated and at 390px; the "Ending your use" link jumps to the heading; no console messages; heading order has no skip.
