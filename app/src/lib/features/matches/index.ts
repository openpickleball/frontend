/**
 * Matches: the player's match history, one match's detail, and confirm and dispute.
 *
 * What the screens can and cannot know
 *
 * - `GET players/{code}/matches` returns every status for the owner, with no status filter
 *   (backend#192). `GET matches/{code}` returns one match, in any status, to its players only.
 *   Everyone else gets the same 404 as an unknown code, so a 404 means "not yours or not there".
 * - Every `MatchOut` says which side the signed-in player is on, their latest decision and which
 *   teams have confirmed (`viewerSide`, `viewerDecision`, `confirmedBySide`). The screens read
 *   those, not the codes. `GET me/matches/awaiting-confirmation` lists the pending matches where
 *   no one on the player's team has confirmed yet. A confirmed match can show both teams false
 *   (an organizer confirmed it), so read `status` for whether a match is confirmed.
 * - Dispute takes no body and stores no reason, so the dialog asks for none.
 *
 * How to use it
 *
 * - Pages: `HomeView`, `HistoryView` (pass `page`, from 1) and `MatchView` (pass the `code` from
 *   the address). Each waits for `myCode` and asks for it when needed.
 * - `rememberMatch(match)`: call it after `POST matches/` succeeds, before going to
 *   `/matches/{code}`. It puts the new match in the cache, so the detail page shows it at
 *   once while it reads the current state. Pass the match as the API returned it after the player's own confirmation (Decision Q4).
 * - `matchCache`: matches by code, filled by every list page and every confirm or dispute
 *   response. `matchCache.get(code)` is reactive. It empties by itself when the signed-in player
 *   changes.
 * - `listMatches(player, offset)`, `listAwaitingConfirmation(offset)`, `getMatch(code)`,
 *   `confirmMatch(code)` and `disputeMatch(code)` are the services. They throw an `AppError` when a call fails.
 * - `format.ts` helpers (`scoreLine`, `teamNames`, `formatDate`, ...) are exported for other
 *   screens that show a match.
 */
export { MatchCache, matchCache, ownerKey, type MatchAction } from './cache.svelte.js';
export {
	PAGE_SIZE,
	configureMatchesApi,
	confirmMatch,
	disputeMatch,
	getMatch,
	listAwaitingConfirmation,
	listMatches,
	rememberMatch
} from './services.js';
export { MatchListView, type ListStatus, type PageFetcher } from './list-view.svelte.js';
export {
	STATUS_LABELS,
	formatDate,
	formatLongDate,
	formatName,
	matchCountLabel,
	matchTitle,
	pageFromSearch,
	rangeLabel,
	rowLabel,
	scoreLine,
	scoringName,
	sideScores,
	teamNames,
	viewpoint,
	wonTag
} from './format.js';
export { default as HomeView } from './components/home-view.svelte';
export { default as HistoryView } from './components/history-view.svelte';
export { default as MatchView } from './components/match-view.svelte';
export { default as MatchRow } from './components/match-row.svelte';
export { default as MatchList } from './components/match-list.svelte';
export { default as StatusPanel } from './components/status-panel.svelte';
export { default as DisputeDialog } from './components/dispute-dialog.svelte';
export { default as Scoreboard } from './components/scoreboard.svelte';
