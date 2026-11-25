/**
 * Players: the signed-in player's own OPEN code, their profile and a ratings card.
 *
 * How to use it
 *
 * - `myCode` is the app-wide store. Call `myCode.load()` when a signed-in screen opens. It asks
 *   `GET me/player`, and when the account has no player yet it creates one with
 *   `POST me/player` from the details the backend holds from sign-up (backend#124). Read
 *   `myCode.status` and `myCode.code`. `status === 'ready'` means `code` is set.
 *   `'needs-details'` means the backend needs the details again: show `PlayerDetailsForm`
 *   and call `myCode.submitDetails()`. `'refused'` is the age refusal and `'unverified'` an
 *   email that is not verified yet. Only against a backend without the create, or offline, does
 *   it fall back to a code the player typed in once and that is kept in localStorage for their
 *   account (Decision Q3): `'needs-entry'` means show `CodeEntry`.
 * - The account email scopes the saved code, so two people on one device never share one.
 *   Pass it in with either of these, because `features/auth` is built separately and this
 *   feature does not import it:
 *     1. `myCode.load(email)`, when the caller has the session at hand, or
 *     2. `setAccountEmailSource(sessionEmail)` (from `features/auth`),
 *        once, at the top level of the root layout's `<script>`, not in `onMount` (a child's
 *        `onMount` runs first). It must resolve only once the session is known: `null` means
 *        signed out, never "still loading".
 *   Call `myCode.reset()` on every sign-in and sign-out, so the next account never sees the
 *   previous one's code.
 *   With neither, `load()` shows the error state. The root layout does 2, and calls
 *   `myCode.reset()` when the account changes.
 * - `OwnCodeGate` finds the code and renders its `children` snippet with it, or the right
 *   fallback: loading, signed out with a Sign in button, an error with Try again, the details
 *   form, the refusal, the unverified email with Try again, or the `CodeEntry` prompt. Props set each page's copy. Matches, record and profile all use it,
 *   so loading, error and retry behavior lives in one place.
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
 *   `GET me/player` and saves with `PATCH me/player` (backend#124), and reads them again once
 *   `myCode` has created the player. Against a backend without them, it says the player can't
 *   change these in the app yet. While the details form or the refusal shows, it shows no
 *   "Name and privacy" section. The backend checks every
 *   change and decides who may make it. Saving a name updates `myCode.displayName`. "Your data"
 *   says how to ask for a copy, until a data export endpoint exists (backend#39).
 *
 * `services.ts` calls `me/player` (GET, POST and PATCH) with the generated types. Only `fetchRatings` reads
 * `provisionalApi`, until ratings ship (backend#53, frontend#35).
 */
export { myCode } from './my-code.svelte.js';
export { setAccountEmailSource } from './account.js';
export { isSampleMode } from './ratings.js';
export { default as OwnCodeGate } from './own-code-gate.svelte';
export { default as ProfileView } from './profile-view.svelte';
export { default as ProfileSettings } from './profile-settings.svelte';
