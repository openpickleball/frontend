/**
 * Offline: matches recorded with no connection, kept on the device until the backend has them
 * (frontend#33). See `plans/offline-match-queue/plan.md` for the decisions.
 *
 * How to use it
 *
 * - `offlineQueue` is the app-wide queue. The root layout calls `setAccount(email)` with the
 *   signed-in account (null when nobody is), `start()` once, and `forget()` when the player signs
 *   out on purpose. The queue is stored in IndexedDB under a hash of the email, so another account
 *   on the device never sees or sends it.
 * - `offlineQueue.add({ own, body, form })` keeps a match and tries to send it. `body` is the
 *   `POST matches/` body, `form` what the record form needs to put the match back. It rejects when
 *   nobody is signed in or the device can't store it: say then that the match was not saved.
 * - The queue sends when the account is set (app open, sign-in), when the app comes back to the
 *   screen, on the `online` event and on "Send now". Each answer: 2xx, or a 409 that names the
 *   match, leaves the queue (`onSent` hears about it). A 401 or no answer, a 5xx or a 429 keeps it
 *   waiting. Anything else moves it to `refused`, with the backend's messages, until the player
 *   fixes it or deletes it (`remove`). Nothing leaves silently.
 * - `QueueNotice` shows "2 matches waiting to send" and each refused match. Its `onfix` opens the
 *   record form with the match: pass `item.form` and `item.problem.fields` to the form, and
 *   `remove(item.id)` once the match is recorded or queued again.
 * - `purgeExpired()` runs on app open and deletes every account's matches queued over
 *   `MAX_QUEUE_AGE_DAYS` ago, keeping a count per account. `QueueNotice` tells that player at their
 *   next sign in (`expired`, `dismissExpired()`).
 * - `signOutWarning(offlineQueue.unsent)` is the text to show before a sign out deletes them.
 *
 * The service worker never caches `/api/`, so every send goes to the network.
 */
export {
	OfflineQueue,
	createOfflineQueue,
	offlineQueue,
	MAX_QUEUE_AGE_DAYS,
	type NewQueuedMatch,
	type QueueDeps,
	type SentMatch,
	type WaitReason
} from './queue.svelte.js';
export { expiredText, signOutWarning, waitingText, waitingTitle } from './copy.js';
export { memoryStore, type QueueStore } from './store.js';
export type { MatchBody, Problem, QueuedMatch } from './types.js';
export { default as QueueNotice } from './components/queue-notice.svelte';
