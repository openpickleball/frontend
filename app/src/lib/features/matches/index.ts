/**
 * Matches: the player's match history, one match's detail, and confirm and dispute.
 *
 * What the screens can and cannot know
 *
 * - `GET players/{code}/matches` returns every status for the owner, with no status filter
 *   (backend#192). There is no `GET matches/{code}` (backend#194), so a cold deep link scans the
 *   list, up to `SCAN_LIMIT` matches.
 * - `MatchOut` does not say whether the player already confirmed (backend#193). The screens show
 *   Confirm and Dispute on every pending match the player is in, and say "Waiting for the other
 *   team" only after the player confirmed or recorded the match in this session. Confirm and
 *   dispute repeat safely on the backend.
 * - Dispute takes no body and stores no reason, so the dialog asks for none.
 *
 * How to use it
 *
 * - Pages: `HomeView`, `HistoryView` (pass `page`, from 1) and `MatchView` (pass the `code` from
 *   the address). Each waits for `myCode` and asks for it when needed.
 * - `rememberMatch(match)`: call it after `POST matches/` succeeds, before going to
 *   `/matches/{code}`. It puts the new match in the cache and notes that the player confirmed it
 *   (recording confirms the submitter's team, Decision Q4), so the detail page opens with no
 *   lookup and says it is waiting for the other team.
 * - `matchCache`: matches by code, filled by every list page and every confirm or dispute
 *   response. `matchCache.get(code)` and `matchCache.actedOn(code)` are reactive. It empties by
 *   itself when the signed-in player changes.
 * - `listMatches(player, offset)`, `findMatch(code, player)`, `confirmMatch(code)` and
 *   `disputeMatch(code)` are the services. They throw an `AppError` when a call fails.
 * - `format.ts` helpers (`scoreLine`, `teamNames`, `formatDate`, ...) are exported for other
 *   screens that show a match.
 */
export { MatchCache, matchCache, ownerKey, type MatchAction } from './cache.svelte.js';
export {
	PAGE_SIZE,
	SCAN_LIMIT,
	configureMatchesApi,
	confirmMatch,
	disputeMatch,
	findMatch,
	listMatches,
	rememberMatch
} from './services.js';
export { MatchListView, type ListStatus } from './list-view.svelte.js';
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
