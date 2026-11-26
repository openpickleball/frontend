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
 *   `features/matches`, which this feature does not import) and `sample`, and can add
 *   sections at the end as children. `ProfileStats` loads the match count and the sample
 *   ratings for one code at a time, and drops late answers for an earlier code.
 * - `myCode.status === 'signed-out'` means nobody is signed in. The route guard owns that.
 * - Ratings: `RatingsCard` is for display. Pass `sample={isSampleMode(PUBLIC_API_MOCK)}` and, in
 *   sample mode, the result of `fetchRatings(code)`. The real backend has no ratings, so
 *   `sample={false}` shows "Ratings aren't live yet".
 *
 * - `ProfileSettings` is the "Name and privacy" and "Your data" sections. It reads
 *   `GET me/player` and saves with `PATCH me/player` (backend#124). It reads them once
 *   `myCode` is ready, and shows no "Name and privacy" section before that. If `me/player`
 *   answers a 404 or 405, it says the player can't change these in the app yet. The backend
 *   checks every change and decides who may make it. Saving a name updates `myCode.displayName`. "Your data"
 *   says how to ask for a copy, until a data export endpoint exists (backend#39).
 *
 * `services.ts` calls `me/player` (GET, POST and PATCH) with the generated types. Only `fetchRatings` reads
 * `provisionalApi`, until ratings ship (backend#53, frontend#35).
 */
export { myCode } from './my-code.svelte.js';
export { isSampleMode } from './ratings.js';
export { default as OwnCodeGate } from './own-code-gate.svelte';
export { default as ProfileView } from './profile-view.svelte';
export { default as ProfileSettings } from './profile-settings.svelte';
