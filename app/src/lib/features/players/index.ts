/**
 * Players: the signed-in player's own OPEN code, their profile and a ratings card.
 *
 * How to use it
 *
 * - `myCode` is the app-wide store. Call `myCode.load()` when a signed-in screen opens. It asks
 *   `GET me/player`, and when the account has no player yet it creates one with
 *   `POST me/player` from the details the backend holds from sign-up (backend#124). Read
 *   `myCode.status` and `myCode.code`. `status === 'ready'` means `code` is set.
 *   `'needs-details'` means the backend needs the details again: `OwnCodeGate` shows its
 *   details form, which calls `myCode.submitDetails()`. `'refused'` is the age refusal,
 *   `'unverified'` an email that is not verified yet, and `'not-created'` a create refused for
 *   the values held from sign-up. The gate shows each of them. Anything else, including no
 *   answer (offline), is `'error'`. The code always comes from the backend: the player can't
 *   type it in or change it, and nothing is kept in the browser.
 * - Call `myCode.reset()` on every sign-in and sign-out, so the next account never sees the
 *   previous one's code. The root layout does, when the account changes and on sign out.
 * - `OwnCodeGate` finds the code and renders its `children` snippet with it, or the right
 *   fallback: loading, signed out with a Sign in button, an error with Try again, the details
 *   form, the refusal, or the unverified email with Try again. Props set each page's copy.
 *   Matches, record and profile all use it, so loading, error and retry behavior lives in one
 *   place.
 * - `ProfileView` is the profile page under its title. The route passes `countMatches` (from
 *   `features/matches`, which this feature does not import), and can add sections at the end
 *   as children. `ProfileStats` loads the match count and the current ratings for one code at a
 *   time, and drops late answers for an earlier code.
 * - `myCode.status === 'signed-out'` means nobody is signed in. The route guard owns that.
 * - Ratings: `fetchRatings(code)` reads `GET players/{code}/ratings` (backend#53) and returns
 *   `null` on its 404. `RatingsCard` shows what the backend sent: every rating with its
 *   reliability and a Demonstration label, each format in a tile of the same size. It computes
 *   nothing about a rating, and never calls a number an OPEN rating.
 * - Rating history: `fetchRatingHistory(code, offset)` reads one page of 5 from
 *   `GET players/{code}/rating-history` (`list_player_rating_history`), newest first, and returns
 *   `null` on its 404 (an unknown code, an inactive account, or history kept private by
 *   `rating_history_visibility`; the player always sees their own). `RatingHistoryView` holds the
 *   page and drops late answers, and `RatingHistory` lists it with Newer and Older.
 *   `RatingHistoryPage` is the page at `ROUTES.ratingHistory`, linked from the ratings card.
 *   Each change shows its format, the value, its reliability, the day and what caused it (`CHANGE_KINDS`: after a match, a recount, or removed by a recount). The API gives no
 *   change amount, and the app works none out.
 *
 * - `ProfileSettings` is the "Name and privacy" and "Your data" sections. It reads
 *   `GET me/player` and saves with `PATCH me/player` (backend#124). It reads them once
 *   `myCode` is ready, and shows no "Name and privacy" section before that. If `me/player`
 *   answers a 404 or 405, it says the player can't change these in the app yet. The backend
 *   checks every change and decides who may make it. Saving a name updates `myCode.displayName`.
 *   Current ratings (`rating_visibility`) are shown as fixed when they are shown to signed-in
 *   players, which can't be undone. When they are private (a player who joined at 13 to 17),
 *   a switch offers to show them, and the backend's refusal before 18 is shown. "Your data"
 *   says how to ask for a copy, until a data export endpoint exists (backend#39).
 *
 * `services.ts` calls `me/player` (GET, POST and PATCH), the ratings and the rating history with
 * the generated types.
 */
export { myCode } from './my-code.svelte.js';
export { default as OwnCodeGate } from './own-code-gate.svelte';
export { default as ProfileView } from './profile-view.svelte';
export { default as ProfileSettings } from './profile-settings.svelte';
export { default as RatingHistoryPage } from './rating-history-page.svelte';
export { SettingsStore, type SettingsDeps } from './settings-store.svelte.js';
export type { MySettings, Visibility } from './types.js';
