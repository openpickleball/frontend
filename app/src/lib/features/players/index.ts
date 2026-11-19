/**
 * Players: the signed-in player's own OPEN code, their profile and a ratings card.
 *
 * How to use it
 *
 * - `myCode` is the app-wide store. Call `myCode.load()` when a signed-in screen opens. It asks
 *   `GET me/player` first, then falls back to a code the player typed in once and that is kept
 *   in localStorage for their account (Decision Q3). Read `myCode.status` and `myCode.code`.
 *   `status === 'ready'` means `code` is set. `'needs-entry'` means show `CodeEntry`.
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
 *   fallback: loading, signed out with a Sign in button, an error with Try again, or the
 *   `CodeEntry` prompt. Props set each page's copy. Matches, record and profile all use it,
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
 * When backend#124 and backend#53 ship, `api/provisional.ts` goes (frontend#35): switch
 * `services.ts` to the generated types. Nothing else here changes.
 */
export { myCode, createMyCode, MyCode } from './my-code.svelte.js';
export type {
	MyCodeDeps,
	MyCodeSource,
	MyCodeStatus,
	SaveError,
	SaveResult
} from './my-code.svelte.js';
export { setAccountEmailSource, currentAccountEmail } from './account.js';
export type { AccountEmailSource } from './account.js';
export { createCodeStore, storageKey } from './storage.js';
export type { CodeStorage, CodeStore } from './storage.js';
export { fetchMyPlayer, fetchRatings } from './services.js';
export { ProfileStats } from './profile-stats.svelte.js';
export type { ProfileStatsDeps } from './profile-stats.svelte.js';
export { isSampleMode, formatRating, toPlayerRatings } from './ratings.js';
export type { MyPlayer, PlayerRatings, Rating } from './types.js';
export { default as CodeEntry } from './code-entry.svelte';
export { default as CodeCard } from './code-card.svelte';
export { default as RatingsCard } from './ratings-card.svelte';
export { default as OwnCodeGate } from './own-code-gate.svelte';
export { default as ProfileView } from './profile-view.svelte';
