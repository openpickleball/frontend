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
 *     2. `setAccountEmailSource(async () => (await session.ready, session.user?.email ?? null))`,
 *        once, at the top level of the root layout's `<script>`, not in `onMount` (a child's
 *        `onMount` runs first). It must resolve only once the session is known: `null` means
 *        signed out, never "still loading".
 *   Call `myCode.reset()` on every sign-in and sign-out, so the next account never sees the
 *   previous one's code.
 *   With neither, the default asks allauth's `GET auth/session` itself.
 *   T7 (record) and T8 (matches) need the code only: wait for `myCode.status === 'ready'`,
 *   then use `myCode.code`. They should call `myCode.load()` if the status is still `'idle'`.
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
export { fetchMyPlayer, fetchMatchCount, fetchRatings } from './services.js';
export { isSampleMode, formatRating, toPlayerRatings } from './ratings.js';
export type { MyPlayer, PlayerRatings, Rating } from './types.js';
export { default as CodeEntry } from './code-entry.svelte';
export { default as CodeCard } from './code-card.svelte';
export { default as RatingsCard } from './ratings-card.svelte';
