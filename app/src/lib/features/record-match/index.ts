/**
 * Record a match: the form and the service behind it.
 *
 * For pages:
 * - `RecordMatchForm`: the whole form. Give it the player's own code (`myCode.code`) and an
 *   `onrecorded` callback. It validates inline, maps the server's 422 errors onto its fields, and
 *   shows the offline and duplicate notices itself. It never queues a match (Decision Q1).
 * - `submitMatch(draft, myCode)`: create the match, then confirm it for the player's team (Q4).
 *   Resolves to `{ match, confirmError }`. `match` is the domain `Match` as the API last returned
 *   it, ready to put in a match cache. `confirmError` is set when the match exists but the
 *   confirmation failed. Rejects with an `AppError` for anything else.
 * - `duplicateMatchCode(error)`: the earlier match a 409 points at, if the backend named it.
 */
export { default as RecordMatchForm } from './components/record-form.svelte';
export { submitMatch, duplicateMatchCode } from './service.js';
export type { SubmitResult, SubmitOptions } from './service.js';
export { RecordForm, todayLocal } from './form.svelte.js';
