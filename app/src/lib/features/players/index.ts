/**
 * Players: the signed-in player's own OPEN code, their profile and settings, and their ratings.
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
 *   the values held from sign-up. `'mfa-required'` is a 403 `mfa_required`: the account needs
 *   two-factor, or this session has not passed it. The gate shows each of them, and for
 *   `'mfa-required'` offers the code prompt when two-factor is on, and the two-factor settings
 *   otherwise: when it is off, and while it is unknown or could not be read again.
 *   Anything else, including no answer (offline), is `'error'`. The code always comes from the backend: the player can't
 *   type it in or change it, and nothing is kept in the browser.
 * - Call `myCode.reset()` on every sign-in and sign-out, so the next account never sees the
 *   previous one's code. The root layout does, when the account changes and on sign out.
 * - `OwnCodeGate` finds the code and renders its `children` snippet with it, or the right
 *   fallback: loading, signed out with a Sign in button, an error with Try again, the details
 *   form, the refusal, the unverified email with Try again, or the two-factor explanation. Props set each page's copy.
 *   Matches, record and profile all use it, so loading, error and retry behavior lives in one
 *   place.
 * - `CodeStrip` is the player's code on one line with Copy code, at the top of Home and Profile.
 * - `ProfileView` is the profile page, which is the settings page: the title, the code strip,
 *   then the settings groups the route passes as children (Account, Privacy, Your data, Help and
 *   about, then Sign out). The player's numbers are on Home and the Ratings page, not here.
 * - `SettingsPage` is a settings page under Profile: a back link to Profile, then the title.
 * - `myCode.status === 'signed-out'` means nobody is signed in. The route guard owns that.
 * - Ratings: `fetchRatings(code)` reads `GET players/{code}/ratings` (backend#53) and returns
 *   `null` on its 404. `RatingsCard` shows what the backend sent: every rating with its
 *   reliability and a Demonstration label, each format in a tile of the same size. It computes
 *   nothing about a rating, and never calls a number an OPEN rating. Home shows it with a
 *   Details link to the Ratings page. `MyRatings` loads the ratings for one code at a time, and
 *   drops late answers for an earlier code.
 * - Rating history: `fetchRatingHistory(code, offset)` reads one page of 5 from
 *   `GET players/{code}/rating-history` (`list_player_rating_history`), newest first, and returns
 *   `null` on its 404 (an unknown code, an inactive account, or history kept private by
 *   `rating_history_visibility`; the player always sees their own). `RatingHistoryView` holds the
 *   page and drops late answers, and `RatingHistory` lists it with Newer and Older.
 *   `RatingsPage` is the Ratings tab at `ROUTES.ratings`: the tiles with the demonstration
 *   notice in a box, then the history. `/profile/ratings` redirects there.
 *   Each change shows its format, the value, its reliability, the day and what caused it (`CHANGE_KINDS`: after a match, a recount, or removed by a recount). The API gives no
 *   change amount, and the app works none out.
 *
 * - `NameSettings` (Profile > Display name) and `VisibilitySettings` (Profile > Profile
 *   visibility) each read `GET me/player` and save with `PATCH me/player` (backend#124). They
 *   read it once `myCode` is ready, and show nothing before that. If `me/player`
 *   answers a 404 or 405, they say the player can't change these in the app yet. The backend
 *   checks every change and decides who may make it. Saving a name updates `myCode.displayName`.
 *   Current ratings (`rating_visibility`) are shown as fixed when they are shown to signed-in
 *   players, which can't be undone. When they are private (a player who joined at 13 to 17),
 *   a switch offers to show them, and the backend's refusal before 18 is shown. `YourData`
 *   (Profile > Copy of your data) says how to ask for a copy, until the app has a download.
 *
 * `services.ts` calls `me/player` (GET, POST and PATCH), the ratings and the rating history with
 * the generated types.
 */
export { myCode } from './my-code.svelte.js';
export { MyRatings } from './my-ratings.svelte.js';
export { default as CodeStrip } from './code-strip.svelte';
export { default as OwnCodeGate } from './own-code-gate.svelte';
export { default as ProfileView } from './profile-view.svelte';
export { default as NameSettings } from './name-settings.svelte';
export { default as SettingsPage } from './settings-page.svelte';
export { default as VisibilitySettings } from './visibility-settings.svelte';
export { default as RatingsCard } from './ratings-card.svelte';
export { default as RatingsPage } from './ratings-page.svelte';
export { default as YourData } from './your-data.svelte';
export { SettingsStore, type SettingsDeps } from './settings-store.svelte.js';
export type { MySettings, Visibility } from './types.js';
