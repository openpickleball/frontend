# Offline match queue

**Status:** active

## Goal

A player who loses the connection while recording a match doesn't lose the match. The app keeps it on the device, sends it when the connection is back, and says what happened to it (frontend#33). Nothing is dropped without the player seeing it.

This fits in one PR.

## Steps

- [x] Check the backend rules for a repeated submission and its error codes.
- [x] Store waiting matches in IndexedDB, one queue per account (`features/offline/`).
- [x] Send them when the app opens, when it comes back to the screen, on the `online` event and on "Send now".
- [x] Queue from the record form when there is no connection.
- [x] Show the queue state, and let the player fix a match the backend refused.
- [x] Warn before a sign out deletes unsent matches.
- [x] Unit, component and e2e tests.

## What the backend does (backend `f4090e5`)

- `POST /api/v1/matches/` calls `record_match` (`apps/matches/services.py`). A player who records a match must be one of its players, or the backend answers 403 `forbidden` before it checks anything else.
- An exact duplicate (the same two teams in either order, the same date, the same game scores, not voided) is refused with 409 `duplicate_match`. For a player's own submission it is never merged or confirmed: only an organizer's Event submission confirms a pending duplicate.
- The 409 names the earlier match in the error item's `existing_code` only when the submitter sent that match, or the submitter's player played in it (`_visible_code`). A player can only record a match they play in, so a duplicate of their own submission always names it. A match the other team recorded first names it too: the player is in it.
- 422 `validation_error` lists one item per field (`config/api_errors.py`). 401 `unauthorized` means the session ended. 403 `forbidden` is a refusal, or a CSRF failure (message "CSRF check Failed"). 429 `throttled` and 5xx are worth trying again.

## Decisions

- **Where the queue lives.** IndexedDB, database `open-offline`, store `matches`, one record per waiting match with the full `MatchCreateIn` body. Each record carries an account key: the SHA-256 of the account's email in lower case, so the email itself is not written to the device. The app reads and sends only the signed-in account's records. Another player who signs in on the same device never sees or sends them. A record also keeps the form as the player filled it (names on the chips), so a refused match can be fixed without typing it again. No new dependency: the wrapper is about 80 lines.
- **What a queued match needs from the backend.** The player's own code is not stored on the device (#223 removed that, see `plans/frontend-v1/plan.md` Q3), and the queue doesn't need it. The body already names every player. The app needs the session to know whose queue to send, so it sends only when the session is signed in.
- **Recording offline needs the code from this visit.** The record form needs the player's own code, which only the backend gives. The app does not keep it on the device. So a match can be queued while the app is open and the code was loaded earlier in the visit. `MyCode` keeps a code it already has through a reload that gets no answer (frontend#249), and stays `ready` while it asks again, so the record page stays usable whether the connection is off or only too weak to answer. A 401 or any other failure, and `reset()`, still clear it. The record page no longer checks `navigator.onLine`: with a known code a failed reload changes nothing, and with none the page shows Try again, as before. An app opened from cold with no connection can't read the session, and goes to sign in as before.
- **How each answer is handled.**
  - 2xx: sent. Removed from the queue. The player sees "Your match was sent" with a link to it.
  - 409 `duplicate_match` with `existing_code`: counted as sent. The earlier match is the player's own or one they played in, often this same match sent before the connection dropped. Removed, and the toast links to the match, where the player can confirm it if the other team recorded it first.
  - 409 with no code, or any other 409: moved to "not sent", with the reason.
  - 401: kept. Sending stops, and the notice says "Sign in again to send it". The app's existing 401 handling sends the player to sign in. After signing in to the same account, the queue sends again.
  - 422 (and 400): moved to "not sent" with the backend's field messages. "Fix and record again" opens the record form filled with the match and the messages on their fields. The record stays until the match is recorded or queued again, or the player deletes it.
  - 403 that is not CSRF, 404, and other 4xx: moved to "not sent" with the reason.
  - 5xx, 429, a CSRF failure the client could not fix, and no answer at all: kept. Sending stops until the next try, so a server that is down is not called once per match.
- **Nothing is dropped silently.** A match leaves the device only when the backend has it (2xx or a 409 that names it), when the player deletes it, or when the player signs out after a warning. A match the backend refused stays in "not sent" until the player acts. If IndexedDB can't be opened, the form shows the old "We lost the connection" error instead of saying it saved anything.
- **Sign out.** The queue is personal data: player codes, dates and scores. A device can be shared. Signing out on purpose deletes this account's queue from the device. If anything is unsent, Sign out asks first: "2 matches haven't been sent yet. They are only on this device, and signing out deletes them." The player can stay signed in, or sign out and delete them. A session that ends by itself (a 401) is not a sign out: the queue stays so it can be sent after the player signs in again.
- **When it sends.** When the session becomes signed in (app open, sign-in), when the page becomes visible again, on the `online` event, and on "Send now". No Background Sync, because iOS doesn't have it. One send at a time per tab, and across tabs with the Web Locks API where the browser has it. A match sent twice by two tabs comes back as a 409 that names it, which counts as sent.
- **CSRF.** The client's CSRF middleware already covers a send after the app reopens: it reads the cookie on every unsafe call, fetches it first when it is missing, and on a CSRF 403 refreshes it and retries once. Bootstrap also calls `initCsrf` on open. No change was needed.
- **Service worker.** Unchanged. `/api/` and `/_allauth/` stay network-only, so a queued send always reaches the network.
- **The queue state.** A notice at the top of every signed-in page: "1 match waiting to send" or "2 matches waiting to send", with what happens next ("We'll send it when you're back online", "Sign in again to send it", or "We couldn't send it yet" with Send now). A refused match has its own notice: "This match wasn't recorded", its date and score, the backend's messages, "Fix and record again" and "Delete".
- **Layers.** `features/offline` owns the store, the queue and the notice. It imports only `api`, `domain` and `ui`. `features/record-match` queues through `offline`'s index. The root layout wires the account, the sign-out cleanup and the toasts. The sign-out warning is a hook in `features/auth` (`setSignOutWarning`), so every Sign out button warns, including the one on the profile page.

## Known limits

- A cold start with no connection can't read the session, so it goes to sign in and the queue waits until the app opens online.
- A queue whose account changes its email is kept under the old key and not shown. The backend gives no stable account id to the browser client.
- After a send, the lists on home and match history show the new match on their next load.
