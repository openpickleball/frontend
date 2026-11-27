# Plan: Update the Privacy Policy for deletion, two-factor and sessions (issue #266)

**Status:** active

Risk tier: Medium. Static HTML only, no code, but the pages make legal promises to players, change text that is already live, and merging deploys to openpb.org. The project owner confirmed Medium by approving this plan.

Domain skills: humanizer: invoke, for every new or rewritten sentence. chrome-devtools-mcp:a11y-debugging: invoke during the live drive, because the page gains a new list and headings. frontend-design, impeccable: not applicable because no styles or layout change. Backend and framework skills (django, allauth, Svelte): not applicable because nothing outside `site/public/privacy/` and `site/public/terms/` changes.

## Goal

The Privacy Policy matches the backend's `docs/privacy/personal-data-inventory.md` at origin/main `c576eb5` (inventory last changed in `060c860`; `0070317` is an ancestor) and ADRs 0043, 0046, 0047, 0048, 0049, 0050, 0053, plus 0031 (rating visibility), 0034 (what moderators do), 0040 (app cookies), 0056 (passkeys) and 0057 (shorter sessions for organizer and club members). Every ADR is "Proposed". The Terms of Service stops contradicting it.

## Decisions

- Project owner, 2026-11-27, scope: every item #266 lists, plus every policy sentence that is now false. Items that are missing but optional (data export details, agreement acceptance records, organizer reports, organizer and club invites, verification request statements, emails you can't turn off, the email logo request, logs, CSV results files, the engine snapshot, possible duplicate holds and vouches) stay out. A follow-up issue lists them.
- Project owner, 2026-11-27: fix the two false Terms sentences (deletion, moderators) in this PR, and bump the Terms version and date.
- Project owner, 2026-11-27: the policy lists all three app cookies (sign-in session, CSRF, device marker) and the app's token headers, not only `open_device`. A comment on #200 asks the Cookie Policy to pick them up.
- Versions: Privacy Policy "Version 3 · Effective November 27, 2026". Terms "Version 2 · Effective November 27, 2026". If the PR merges later, the reviewer updates both dates. No email is owed: player accounts are not open yet.
- Unusual submission flags (ADR 0049): the policy describes no match flags today, and the issue makes that item conditional ("If the policy describes match flags"). So no flag text is added. Flags are in the follow-up issue's list.
- Deletion today: the backend has `DELETE /api/v1/accounts/me`, and staff deleting an account in the admin run the same steps (#317). The app has no delete screen yet (frontend#265). So the policy says: a button in the app is not built yet; until it is, email info@openpb.org and we delete the account. Deleting from the app will ask you to confirm with your password or a two-factor code.
- Ratings: no OPEN rating is published (hard rule 3). The backend keeps current ratings and a rating history, each marked as a demonstration (ADR 0031). The policy describes them as "test ratings" kept once accounts open, never as a published OPEN rating.
- Data export: the backend has it (ADR 0051), but the app page is not built. The existing "Getting a copy of your data" text stays true and is unchanged.
- Backups: #67 (backup retention) is still open. ADR 0048 and ADR 0009 commit to the 30 days. The policy states the commitment, as the issue asks.
- Pwned Passwords is presented apart from "Services we use", like Photon: OPEN's server sends it a five-character hash prefix and nothing that identifies you, so it handles no personal data for us.
- Implementation, 2026-11-27, where the backend source differed from this plan (the source wins):
  - Staff reveal: the Player admin reveals the four fields together, in one POST with one `player.personal_data_view` event (ADR 0046, `apps/players/admin.py`), not one by one. Criterion 8 now says each reveal is recorded.
  - Organizer members: only an Organizer's admin members (with MFA) list the other members (`list_organizer_members`, inventory `clubs.OrganizerMember`). The policy says "Its admins see the other people who act for it", not "its members see each other".
  - Deletion and two-factor: ADR 0048 names an Organizer member as an Account that must have MFA, but `mfa_required` (`apps/accounts/mfa.py`) and ADR 0043's API rule cover staff, moderators and owners of a production Partner Application. The policy says "If OPEN requires two-factor sign-in for your account, you will need to set it up first", which is true under both.
  - Who must use two-factor: ADR 0043 also requires it for the owner of a partner app with production access. The policy names "an approved partner app" too.
  - A kept Account row gets a placeholder email that receives no mail (ADR 0048). The policy says the email address is removed.
- Implementation, 2026-11-27, layout and wording: the deletion items sit under a new h3 "Deleting your account" inside "How long we keep it", so the list reads in groups. In the Terms, "Players confirm or dispute their own matches." is left out, because the item before it already says the players in a match confirm or dispute it.

## Acceptance criteria

1. Deletion (ADR 0048). "Deleting an account is not built yet", "can't be deleted at all" and "We are still deciding" are gone from the policy. The policy says how to delete today (email; the app button once frontend#265 ships, with a password or two-factor check) and what goes and what stays, as listed under Order of work step 3. It says the same email can sign up again as a new player, and the old matches stay with the old, deleted player.
2. Backups: deleted data ages out of backups within 30 days, and a backup is never restored to bring an account back. The outbox and Resend sentences stay true.
3. Two-factor and passkeys (ADR 0043, 0056): the policy names the authenticator app secret and the recovery code seed (encrypted, never shown to anyone after setup), passkeys (name, credential ID, public key; the device shows your email as the passkey's name), who must use two-factor, and that they are kept until you remove them or delete your account.
4. Sessions (ADR 0047, 0057): the session list with IP address and browser or app, kept only while the session lasts; the 30 days after sign-in or 7 days after last use limits (7 days and 1 day for organizer and club members); what ends other sessions (password change, password reset ends every session, removing two-factor or a passkey). The "Your sign-in session" item lists what a session holds, as in step 2.
5. Sign-in alerts and cookies: the device marker (`open_device` cookie in a browser, a device token in the app), what it holds (no email, IP address or browser details), 365 days, and the alert email. A new app cookie list names the sign-in session cookie, the CSRF cookie and the device marker. The openpb.org "no cookies" sentence stays.
6. Breached password check: first five characters of the password's SHA-1 hash to the Pwned Passwords range API, never the password, skipped when the service is down.
7. Sign-in limits: IP address and a hash of the typed email address, at most an hour, in short-term memory.
8. Encryption and staff access (ADR 0046): legal name, birth month and year, gender division and two-factor secrets are encrypted; staff see those four player fields only by revealing them, and each reveal is recorded.
9. Who sees what: a match shows its event's name and code, its organizer's OPEN Code and its club's name and code to everyone who can see the match, never the organizer's name (ADR 0053); an organizer's members see its name and code (ADR 0050). "Organizer details: staff." is gone.
10. Moderators (#273, ADR 0034): the "Staff" definition no longer implies moderators see email, legal name, birth month and year or gender division. Moderators see players by OPEN Code only.
11. Now-false lines fixed: six privacy settings, with current ratings locked (adults can't hide them; players aged 13 to 17 start hidden and can't widen them); "you won't be able to hide them" gone; rating history no longer said to be not kept; the Ages section says ratings of players aged 13 to 17 start hidden.
12. Terms: "OPEN's moderators can correct a match or void it." and "Deleting an account is not built yet" are gone, replaced with true text. Terms show "Version 2 · Effective November 27, 2026"; the policy shows "Version 3 · Effective November 27, 2026".
13. Both pages: no em dashes, no emojis, no "user", no named competing rating system, no claim an OPEN rating is live or published. `pnpm build` in `site/` passes. The pages read clearly in black and ivory and with reduced motion.

## Files that change

- `site/public/privacy/index.html`: version line; "This website" cookies item (unchanged meaning); "Player accounts" lists; "Who can see what"; "Services we use" note; "Ages"; "How long we keep it"; "Keeping your data safe"; "Your choices". New h3 "Two-factor sign-in and passkeys" and "Cookies in the app" under "Player accounts", and "Deleting your account" under "How long we keep it".
- `site/public/terms/index.html`: version line, the moderators item in "Matches", the deletion item in "Ending your use".
- `plans/privacy-policy-v3/plan.md`: this plan.

`site/AGENTS.md` already says the policy follows the inventory. No doc change is expected; Phase 8 confirms.

## Order of work

Every fact below comes from backend origin/main; check any you doubt with `git -C ~/WebstormProjects/backend show origin/main:<path>`. Write plain, short sentences for players. Keep the page's existing structure, classes and link pattern (`target="_blank" rel="noopener"` plus `<span class="sr-only"> (opens in a new tab)</span>`).

1. **Proof script, red first.** Write `<scratch>/proof.sh` (scratch dir from the coordinator) that checks every criterion it can by grep (see Proof). Run it on the unchanged pages and keep the red output.
2. **"What OPEN records"** (privacy page):
   - Matches item: add that a match also records its event's code and its organizer's and club's OPEN Codes.
   - Privacy settings item: six settings: match history, stats, rating history, current ratings, home club, and city and region.
   - Sign-in session item: rewrite. A session holds the email address a login was started with, how and when you signed in and when it was last used, the agreement versions you accepted at signup, your signup details until your player profile is created (as today), while setting up two-factor the new authenticator secret, and during a passkey sign-in a one-time challenge. Kept until you log out, end it, or it expires.
   - New item: the session list: each signed-in session records its IP address (an IPv6 address shortened to its first half) and the browser or app it came from, so you can see and end your sessions. Kept only while that session lasts.
   - Sign-in limits item: limits on sign-in, signup, password reset and similar actions keep your IP address and a hash of the email address you typed, not the address itself, in short-term memory for at most an hour.
   - New item: test ratings: once accounts open, OPEN calculates ratings from matches and keeps your current ratings and a history of each change, as test ratings. No OPEN rating is published yet.
3. **New h3 "Two-factor sign-in and passkeys"** under "Player accounts", after "What OPEN records": you can add an authenticator app (OPEN stores its secret) and recovery codes (OPEN stores the seed they are made from and which were used); both encrypted, shown to you only during setup, never to anyone else, never in a log. Passkeys: OPEN stores the name you give it, its credential ID and public key, none of which is a secret; your device shows your email address as the passkey's name. Two-factor is required for people who act for a verified organizer, staff and moderators; other players choose. Kept until you remove them or delete your account; a password reset removes every passkey.
4. **New h3 "Cookies in the app"**, after the two-factor h3: the sign-in session cookie (keeps you signed in, lasts the session); the security cookie that stops other sites sending forms as you (CSRF); `open_device`, the device marker, which holds a signed list of up to 10 scrambled account IDs (keyed hashes), no email, IP address or browser details, kept 365 days after your last sign-in on that device. The OPEN app on a phone sends the same session and device tokens in its requests instead of cookies. Then the sign-in alert: when you sign in from a device without the marker, OPEN emails you the time, whether it was a web browser or the OPEN app, and a link to your session list. Your first sign-in sends none. Clearing cookies or reinstalling the app counts as a new device.
5. **"Who can see what"**:
   - Intro: "Staff" means OPEN volunteers whose role needs the information. Moderators review organizers and see players only by OPEN Code, never email, legal name, birth month and year or gender division. Drop "including moderators".
   - Matches item: add that a match shows its event's name and code, its organizer's OPEN Code and its club's name and code to everyone who can see the match. It never shows the organizer's name. If an organizer is one person, its code points to that person.
   - Birth month and year, gender division, legal name: "you, and staff with access to personal data. Each time staff look, OPEN records it." Email stays "you, and staff. Never other players."
   - Replace "Organizer details: staff." with: an organizer's name and OPEN Code: the people who act for it, and staff. Its admins see the other members by display name, OPEN Code and role, never by email.
   - Sign-in session item: you see your own sessions, with their IP address and browser or app. Nobody else, through the app.
   - Two-factor item (new): nobody, not even you after setup.
   - Ratings item: no OPEN rating is published yet. Your current ratings: every signed-in player, and adults can't hide them. Players aged 13 to 17 start hidden and stay hidden until they choose to show them at 18 or later. Rating history: whoever your rating history setting allows.
6. **"Services we use"**: after the Photon paragraph, a short paragraph on the breached password check: when you pick a password, OPEN's server sends the first five characters of its SHA-1 hash to the Pwned Passwords range API, to check it hasn't appeared in a known data breach. It never sends the password, your email address or your IP address. If the service is down, the check is skipped. Link Pwned Passwords' privacy page: `https://haveibeenpwned.com/Privacy` (check it resolves; if not, link `https://haveibeenpwned.com/API/v3#PwnedPasswords`).
7. **"Ages"**: the 13 to 17 item adds that their current ratings start hidden and stay hidden until they choose to show them at 18 or later.
8. **"How long we keep it"**, replace the deletion item and the "won't remove everything" item:
   - How: you can delete your account. A button in the app is not built yet. Until it is, email info@openpb.org and we delete it for you. In the app, you will confirm with your password or a two-factor code. If OPEN requires two-factor sign-in for your account, you set it up first.
   - What goes: email addresses, password, sessions, two-factor and passkeys, the record of which agreements you accepted, organizer reports you filed, invites sent to you or by you, queued emails, the admin history entries tied to you, organizer memberships and club roles, and a data copy waiting to download.
   - Your player profile: if nothing depends on it (no match, confirmation or rating), it is deleted with its settings. Otherwise it stays with its OPEN Code, shown as "Deleted player" in records and as "Private player" to other players; your legal name, gender division and city and region are emptied, your birth month and year become empty, and every privacy setting is set to private. No new match can name it.
   - What stays: the Ledger as it is (matches, who played, scores, confirmations and disputes, ratings and rating history), the link to matches you submitted, and the audit record of changes.
   - Your account row: deleted outright if nothing depends on it. If something does (for example you submitted a match, confirmed one, or made a change OPEN records, which most players have), a cleared and deactivated row stays, with no email address, no password and no last sign-in date. The date you joined stays.
   - Organizers: an organizer whose only member is you is renamed "Removed organizer", and its verification statements are blanked. Its events stay as they are. A shared organizer keeps its name.
   - Signing up again: the same email address can sign up again, as a new player. The old matches and ratings stay with the old, deleted player. This is also how to fix a birth month and year or gender division entered wrong.
   - Backups: deleted data ages out of backups within 30 days. We never restore a backup to bring a deleted account back.
   - Keep: "We keep your account details while your account exists..." and the outbox and Resend item.
   - Add: the session list entries go when the session ends; sign-in limit entries last at most an hour.
9. **"Keeping your data safe"**: add: legal name, birth month and year, gender division and two-factor secrets are encrypted in the database, and each time staff reveal one of those player details, OPEN records it. Add: two-factor sign-in and passkeys are available; when you change or reset your password, or remove two-factor or a passkey, OPEN signs you out everywhere else (a reset signs out every session, this one too). Sessions end 30 days after sign-in or 7 days after last use, or 7 days and 1 day if you act for an organizer or club. Mention the breached password check in one line pointing to "Services we use".
10. **"Your choices"**: first item names six settings; current ratings has no "only you" choice for adults, and players aged 13 to 17 can't widen it. Third item becomes: "OPEN doesn't keep stats or a home club for you yet. Those two settings are saved, but they don't change anything today. Anyone who can see your match history can work out your wins and losses from it." Add: see and end your sessions, and add two-factor or passkeys, in your account settings, once the app is out.
11. **Version line** to "Version 3 · Effective November 27, 2026".
12. **Terms** (`site/public/terms/index.html`):
    - "Matches": replace the moderators item with: "For a match from an event, the event's verified organizer settles a dispute. A dispute nobody settles in 30 days voids the match." and "OPEN's moderators can void the matches of a submitter that broke these terms." Check ADR 0034 (`MATCH_DISPUTE_EXPIRY_DAYS`) before writing the 30 days.
    - "Ending your use": replace the deletion item with: you can delete your account. A button in the app is not built yet; until it is, email info@openpb.org and we delete it for you. Your matches stay in the Ledger under "Deleted player". The Privacy Policy explains what stays.
    - Version line to "Version 2 · Effective November 27, 2026".
13. Run the humanizer skill over every new sentence. Then the proof script (green), `pnpm build` in `site/`, and the live drive.
14. Commit the pages with a body that explains why. Commit plan edits with the work that departs from it.

## Risks

- A promise that isn't true. Each sentence must trace to the inventory, an ADR above, or a decision here. The verifier walks every criterion against the backend at origin/main.
- Implying a live rating (hard rule 3). "Test ratings" and "no OPEN rating is published yet" must stay next to any rating sentence.
- Over-explaining. The page is for players. Prefer fewer, shorter items over full field lists; never name internal model or setting names, except the `open_device` cookie name.
- Backups (#67 open) and the app delete button (frontend#265) are not built. The text says what will happen and what to do today.
- The page gets long. Keep it to h2 and h3 inside the existing `legal` body; no new styles.

## Proof

- Proof script in the scratch dir, red on the unchanged pages, green after. It checks:
  - present in the policy: "Version 3 · Effective November 27, 2026", "Deleted player", "Removed organizer", "open_device", "Pwned Passwords", "two-factor", "passkey", "backup", "sign up again", "encrypted", "365 days", "first five characters", "an hour", "event's name", "never shows the organizer's name" (or the wording used, kept in sync with the page);
  - absent from the policy: "Deleting an account is not built yet", "can't be deleted at all", "We are still deciding", "you won't be able to hide them", "Organizer details:</strong> staff", "including moderators", "OPEN doesn't keep stats, a rating history or a home club";
  - Terms: present "Version 2 · Effective November 27, 2026"; absent "moderators can correct a match", "Deleting an account is not built yet";
  - both pages: no U+2014, no word "user", no "OPEN rating is live", no "published OPEN rating".
- Criteria 1 to 11: the verifier walks each against the backend sources named in Goal.
- Criterion 13: `pnpm build` output. Live drive (Medium): serve `site/public/` (the `site` entry in `.claude/launch.json`, port 4173), open `/privacy/` and `/terms/` in black and ivory and with reduced motion emulated; check the new headings, lists and links render, the heading order has no skipped level, the footer links work, and the new outbound link opens in a new tab with its hidden label.
- Measured on origin/main `ef1164f` with `grep -cF`: each "absent" phrase above prints 1 in its page today ("Deleting an account is not built yet", "We are still deciding", "you won't be able to hide them", "Organizer details:</strong> staff", "including moderators", "OPEN doesn't keep stats, a rating history or a home club", "Version 2 · Effective November 24, 2026" in the policy; "moderators can correct a match", "Deleting an account is not built yet", "Version 1 · Effective November 23, 2026" in the Terms). "Deleted player", "Removed organizer", "open_device", "Pwned Passwords", "two-factor", "Version 3" and "backup" print 0 in the policy (`grep -ciF`). So every check fails before the change.
