/**
 * Record a match, or correct one: the form and the service behind it.
 *
 * For pages:
 * - `RecordMatchForm`: the whole form. Give it the player's own code (`myCode.code`, which comes
 *   from the backend) and an `onrecorded` callback. This feature never imports players, so the
 *   page wires it. It validates inline, maps the server's 422 errors onto its fields, and shows the
 *   offline and duplicate notices itself. It never queues a match (Decision Q1). It keeps what the
 *   player entered in `sessionStorage` (per own code) until the match is recorded, so a reload or a
 *   stray tap does not lose it. See `draft.ts`.
 * - Pass `correcting={{ code, draft }}` to correct a pending or disputed match instead
 *   (backend#267). `correctionDraft(match, own)` gives the starting values, or null when the
 *   match can't be corrected from the app (the player is not in it, or a player is private). The
 *   players and format stay fixed, nothing is kept in `sessionStorage`, and the backend's 404 and
 *   409 read as a correction's: a 404 is, in practice, a match played at an event, which only its
 *   organizer can change. `onrecorded` gets the correction, a new match with a new code.
 * - `submitMatch(draft, myCode)`: create the match. The backend records the submitter's team
 *   confirmation with it (Q4). Resolves to `{ match }`, the domain `Match` as the create call
 *   returned it, ready to put in a match cache. Rejects with an `AppError`.
 * - `correctMatch(code, draft, myCode)`: correct the match. The backend voids it and resolves to
 *   the correction, pending with `myCode`'s team confirmation.
 * - `duplicateMatchCode(error)`: the earlier match a 409 points at, if the backend named it.
 */
export { default as RecordMatchForm } from './components/record-form.svelte';
export { correctMatch, submitMatch, duplicateMatchCode } from './service.js';
export type { SubmitResult, SubmitOptions } from './service.js';
export { RecordForm } from './form.svelte.js';
export { correctionDraft, type Draft } from './draft.js';
