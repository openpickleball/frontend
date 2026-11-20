/**
 * Record a match: the form and the service behind it.
 *
 * For pages:
 * - `RecordMatchForm`: the whole form. Give it the player's own code (`myCode.code`) and an
 *   `onrecorded` callback, and optionally `onchangecode`, which the "Change my code" button calls
 *   when the backend refuses the saved code. This feature never imports players, so the page
 *   wires it. It validates inline, maps the server's 422 errors onto its fields, and shows the
 *   offline and duplicate notices itself. It never queues a match (Decision Q1). It keeps what the
 *   player entered in `sessionStorage` (per own code) until the match is recorded, so a reload or a
 *   stray tap does not lose it. See `draft.ts`.
 * - `submitMatch(draft, myCode)`: create the match, then confirm it for the player's team (Q4).
 *   Resolves to `{ match, confirmError }`. `match` is the domain `Match` as the API last returned
 *   it, ready to put in a match cache. `confirmError` is set when the match exists but the
 *   confirmation failed. Rejects with an `AppError` for anything else.
 * - `recordedToast(result)`: the toast to show after saving, with the confirm-failure wording.
 * - `duplicateMatchCode(error)`: the earlier match a 409 points at, if the backend named it.
 */
export { default as RecordMatchForm } from './components/record-form.svelte';
export { submitMatch, duplicateMatchCode } from './service.js';
export type { SubmitResult, SubmitOptions } from './service.js';
export { recordedToast } from './recorded-toast.js';
export { RecordForm } from './form.svelte.js';
