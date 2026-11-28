/**
 * Matches: the player's match history, one match's detail, confirm, dispute and withdraw a
 * dispute, and vouch for a held match.
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
 * - `GET me/matches/disputes` lists the disputed matches the player played in, whoever disputed
 *   them. A player withdraws their own open dispute with `POST matches/{code}/withdraw-dispute`.
 *   The match stays disputed while another player's dispute is open. A withdrawn dispute still
 *   counts as the player's one dispute, so the page offers no Dispute after it.
 * - A possible duplicate hold keeps a match from counting when another match has the same teams
 *   and date with other scores. `MatchOut` has no hold field, and the other match is never named.
 *   `GET me/matches/holds` lists the held matches the account may vouch for, with `vouched` for
 *   its own side: matches with no event it played in, and event matches of an organizer it is a
 *   member of. `GET matches/{code}` gives players only, so the match page falls back to the holds
 *   list on a 404, for an organizer who came from a hold email. `POST matches/{code}/vouch`
 *   can't be undone, and its answer doesn't say whether the hold ended, so the page reads the
 *   holds list again. The cache keeps each known hold (`holdOf`).
 * - A player corrects a pending or disputed match with no Event and no Club on its own page,
 *   `/matches/{code}/correct`, which the route builds from the record-match form (backend#267).
 *   The backend voids the old match and returns the correction, a new match with a new code.
 *   `MatchOut` doesn't link the two. The panel offers "Correct the score" only when
 *   `canCorrect` says so: no Event or Club, and every player has a code. Opened directly for a
 *   match with an Event or a Club, the correction page says why (`CORRECT_EVENT_NOTE`,
 *   `CORRECT_CLUB_NOTE`, plus `CORRECT_CLUB_DISPUTE` when the panel offers Dispute). The form still
 *   explains the 404 the backend gives one.
 *   `rememberCorrection(correction, old)` tells the cache, so the old match's page links to the
 *   correction in this visit.
 * - `MatchOut` sends the match's Event (code, name and its organizer's code) and Club (code and
 *   name), each null when there is none (backend#302). The match page names them in Details.
 *   Match rows don't. The organizer is never named. Who settles a dispute depends on the Event
 *   (backend ADR 0034), so the Disputed popover picks `DISPUTE_ENDS` or `DISPUTE_ENDS_EVENT`. A
 *   dispute on a Club-only match is settled by its players. The vouch text needs no such pick:
 *   the holds list only gives a hold to a viewer who may vouch, and nobody vouches for a held
 *   Club-only match.
 * - `status.ts` (`matchStatusCopy`) says how each status and decision reads and which buttons
 *   the status panel offers. Add a new status or action there.
 *
 * How to use it
 *
 * - Pages: `HomeView`, `HistoryView` (pass `page`, from 1, and `show`, the filter) and `MatchView` (pass the `code` from
 *   the address). Each waits for `myCode` and asks for it when needed.
 * - `rememberMatch(match)`: call it after `POST matches/` succeeds, before going to
 *   `/matches/{code}`. It puts the new match in the cache, so the detail page shows it at
 *   once while it reads the current state. Pass the match as `POST matches/` returned it. The
 *   backend records the submitter's team confirmation with the match (Decision Q4).
 * - `matchCache`: matches by code, filled by every list page and every confirm or dispute
 *   response. `matchCache.get(code)` is reactive. It empties by itself when the signed-in player
 *   changes.
 * - `listMatches(player, offset)`, `countMatches(player)`, `listAwaitingConfirmation(offset)`,
 *   `listMyDisputes(offset)`, `listMyHolds(offset)`, `findHold(code)`, `getMatch(code)`,
 *   `confirmMatch(code)`, `disputeMatch(code)`, `withdrawDispute(code)` and `vouchForMatch(code)`
 *   are the services. They throw an `AppError` when a call fails.
 * - `needsYou`: the matches that need the player (to confirm, or held and not vouched for by
 *   their side), oldest first. Home, the nav badge (`needsYou.count`) and the Needs you filter
 *   read it. The backend has no such list, so `needsYou.load()` reads the awaiting-confirmation
 *   and holds lists in full and merges them. The root layout loads it once the player's code is
 *   known, for the badge.
 * - `filter.ts` has the Matches filters (`MATCH_FILTERS`): All, Needs you, Disputed and On hold,
 *   in the address as `?show=`. `filterFromSearch` reads it, `matchesQuery(filter, page)` builds
 *   it, so Home can link straight to a filter. There is no "Waiting for the other team" filter
 *   until the backend serves that list.
 * - `format.ts` helpers (`scoreLine`, `teamNames`, `formatDate`, ...) are exported for other
 *   screens that show a match.
 */
export {
	MatchCache,
	matchCache,
	ownerKey,
	type HoldState,
	type MatchAction
} from './cache.svelte.js';
export {
	PAGE_SIZE,
	confirmMatch,
	countMatches,
	disputeMatch,
	findHold,
	getMatch,
	listAwaitingConfirmation,
	listMatches,
	listMyDisputes,
	listMyHolds,
	rememberCorrection,
	rememberMatch,
	vouchForMatch,
	withdrawDispute
} from './services.js';
export {
	CORRECT_CLUB_DISPUTE,
	CORRECT_CLUB_NOTE,
	CORRECT_EVENT_NOTE,
	CORRECT_NOTE,
	VOIDED_CORRECTED,
	canCorrect,
	DISPUTE_ENDS,
	DISPUTE_ENDS_EVENT,
	HOLD_COUNTS,
	HOLD_ENDS,
	HOLD_WHY,
	VOUCH_MEANS,
	VOUCH_MEANS_ORGANIZER,
	hasActions,
	matchStatusCopy,
	statusInfo,
	type MatchStatusCopy,
	type PanelAction,
	type StatusInfo
} from './status.js';
export {
	MATCH_FILTERS,
	fetcherFor,
	filterFromSearch,
	filterLabel,
	matchesQuery,
	type MatchFilter
} from './filter.js';
export { MatchListView, type ListStatus, type PageFetcher } from './list-view.svelte.js';
export {
	NeedsYouView,
	needsYou,
	needsYouActions,
	type NeedsYouAction
} from './needs-you.svelte.js';
export {
	NEEDS_CONFIRMATION_LABEL,
	NEEDS_VOUCH_LABEL,
	ON_HOLD_LABEL,
	STATUS_LABELS,
	formatDate,
	formatLongDate,
	formatName,
	matchCountLabel,
	matchHeadline,
	matchTags,
	matchTitle,
	pageFromSearch,
	rangeLabel,
	resultWord,
	rowLabel,
	rowPlayers,
	scoreLine,
	scoringName,
	sideScores,
	teamNames,
	viewpoint,
	wonTag,
	type MatchTag
} from './format.js';
export { default as HomeView } from './components/home-view.svelte';
export { default as HistoryView } from './components/history-view.svelte';
export { default as MatchView } from './components/match-view.svelte';
export { default as CorrectView } from './components/correct-view.svelte';
export { default as MatchRow } from './components/match-row.svelte';
export { default as MatchList } from './components/match-list.svelte';
export { default as MatchTags } from './components/match-tags.svelte';
export { default as StatusPanel } from './components/status-panel.svelte';
export { default as DisputeDialog } from './components/dispute-dialog.svelte';
export { default as WithdrawDialog } from './components/withdraw-dialog.svelte';
export { default as VouchDialog } from './components/vouch-dialog.svelte';
export { default as Scoreboard } from './components/scoreboard.svelte';
