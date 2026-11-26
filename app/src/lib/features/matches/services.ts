import { api as appApi, unwrap, type ApiOption } from '#lib/api/index.js';
import {
	toHoldPage,
	toMatch,
	toMatchPage,
	type Hold,
	type HoldPage,
	type Match,
	type MatchCode,
	type MatchPage,
	type PlayerCode
} from '#lib/domain/index.js';
import { matchCache, type MatchCache } from './cache.svelte.js';

/** Matches per page. The API's own maximum is larger, and 20 matches the mockups. */
export const PAGE_SIZE = 20;

/**
 * One page of the player's matches, newest first. The owner sees every status. Every match on
 * the page goes into the cache. `offset` is how many matches to skip.
 */
export async function listMatches(
	player: PlayerCode,
	offset = 0,
	{
		limit = PAGE_SIZE,
		cache = matchCache,
		api = appApi
	}: { limit?: number; cache?: MatchCache } & ApiOption = {}
): Promise<MatchPage> {
	const dto = await unwrap(
		api.open.GET('/api/v1/players/{code}/matches', {
			params: { path: { code: player }, query: { limit, offset } }
		})
	);
	const page = toMatchPage(dto);
	cache.rememberAll(page.items);
	return page;
}

/**
 * How many matches the player is in, whatever their status: the list's `count`, read from a
 * one-match page. That match is not mapped or cached.
 */
export async function countMatches(
	player: PlayerCode,
	{ api = appApi }: ApiOption = {}
): Promise<number> {
	const dto = await unwrap(
		api.open.GET('/api/v1/players/{code}/matches', {
			params: { path: { code: player }, query: { limit: 1 } }
		})
	);
	return dto.count;
}

/**
 * One page of the matches that wait for the signed-in player: pending, they played in them, and
 * no one on their team has confirmed. Newest first, like the history. Every match on the page
 * goes into the cache. `offset` is how many matches to skip.
 */
export async function listAwaitingConfirmation(
	offset = 0,
	{
		limit = PAGE_SIZE,
		cache = matchCache,
		api = appApi
	}: { limit?: number; cache?: MatchCache } & ApiOption = {}
): Promise<MatchPage> {
	const dto = await unwrap(
		api.open.GET('/api/v1/me/matches/awaiting-confirmation', {
			params: { query: { limit, offset } }
		})
	);
	const page = toMatchPage(dto);
	cache.rememberAll(page.items);
	return page;
}

/**
 * One page of the disputed matches the signed-in player played in, newest first, whoever
 * disputed them. A match leaves the list once its dispute is withdrawn, settled or ends. Every
 * match on the page goes into the cache. `offset` is how many matches to skip.
 */
export async function listMyDisputes(
	offset = 0,
	{
		limit = PAGE_SIZE,
		cache = matchCache,
		api = appApi
	}: { limit?: number; cache?: MatchCache } & ApiOption = {}
): Promise<MatchPage> {
	const dto = await unwrap(
		api.open.GET('/api/v1/me/matches/disputes', { params: { query: { limit, offset } } })
	);
	const page = toMatchPage(dto);
	cache.rememberAll(page.items);
	return page;
}

/**
 * One page of the held matches the signed-in account may vouch for, newest first: matches with
 * no event they played in, and matches of an event run by an organizer they are a member of. A
 * match leaves the list once its hold ends. Every match and hold on the page goes into the cache.
 * The first page, when it holds the whole list, also tells the cache which holds ended.
 */
export async function listMyHolds(
	offset = 0,
	{
		limit = PAGE_SIZE,
		cache = matchCache,
		api = appApi
	}: { limit?: number; cache?: MatchCache } & ApiOption = {}
): Promise<HoldPage> {
	const dto = await unwrap(
		api.open.GET('/api/v1/me/matches/holds', { params: { query: { limit, offset } } })
	);
	const page = toHoldPage(dto);
	cache.rememberHolds(page.items, {
		complete: offset === 0 && page.items.length >= page.count
	});
	return page;
}

/** The largest page the holds list gives, so `findHold` needs few requests. */
const HOLDS_PAGE = 100;

/**
 * The most pages `findHold` reads. The loop trusts the list's `count`, so a wrong count must not
 * keep it asking forever. 1,000 holds is far more than any player or organizer has.
 */
const HOLDS_MAX_PAGES = 10;

/**
 * Whether a match is held, from the holds list. `MatchOut` has no hold field, so this is the only
 * way to tell. Resolves to the hold, or null when the list doesn't have the match (it is not held,
 * or the account may not vouch for it). Reads the list page by page until it finds the match, and
 * puts what it learns in the cache. Reads at most 10 pages of 100. Throws an `AppError` when a
 * page fails.
 */
export async function findHold(
	code: MatchCode,
	{ cache = matchCache, api = appApi }: { cache?: MatchCache } & ApiOption = {}
): Promise<Hold | null> {
	for (let pages = 0; pages < HOLDS_MAX_PAGES; pages++) {
		const offset = pages * HOLDS_PAGE;
		const page = await listMyHolds(offset, { limit: HOLDS_PAGE, cache, api });
		const found = page.items.find((hold) => hold.match.code === code);
		if (found) return found;
		if (page.items.length === 0 || offset + page.items.length >= page.count) {
			cache.endHold(code);
			return null;
		}
	}
	// Past the cap. The match may still be held further on, so the cache keeps what it knew.
	return null;
}

/**
 * Read one match from the API and remember it. Only the match's players can read it. Anyone else,
 * and any unknown or malformed code, gets the same 404, so a `not_found` `AppError` means "not
 * yours or not there". Any other failure is an `AppError` too. It always asks the API, so it
 * gives the current state, for a first read and to refresh a cached copy. Pass
 * `remember: false` to keep it out of the cache, so the caller can drop a read that came too late.
 */
export async function getMatch(
	code: MatchCode,
	{
		cache = matchCache,
		remember = true,
		api = appApi
	}: { cache?: MatchCache; remember?: boolean } & ApiOption = {}
): Promise<Match> {
	const dto = await unwrap(api.open.GET('/api/v1/matches/{code}', { params: { path: { code } } }));
	const match = toMatch(dto);
	if (remember) cache.remember(match);
	return match;
}

/**
 * Confirm a match the player played in. Confirming again is safe on the backend. Resolves to the
 * match as the API now has it (it is `confirmed` once both teams have), and remembers it. Throws
 * an `AppError`: a 409 `conflict` when the match was disputed or voided.
 */
export async function confirmMatch(
	code: MatchCode,
	{ cache = matchCache, api = appApi }: { cache?: MatchCache } & ApiOption = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/confirm', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	return match;
}

/**
 * Dispute a match the player played in. It takes no reason, and the backend stores none. A player
 * disputes a match once: a repeat, also after they withdrew, changes nothing. Resolves to the
 * match as the API now has it (`disputed`, unless they had withdrawn).
 */
export async function disputeMatch(
	code: MatchCode,
	{ cache = matchCache, api = appApi }: { cache?: MatchCache } & ApiOption = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/dispute', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	return match;
}

/**
 * Withdraw the player's own open dispute. Resolves to the match as the API now has it, and
 * remembers it: still `disputed` while another player's dispute is open, else back to
 * `confirmed` or `pending`, as it was before. The withdrawn dispute still counts as the player's
 * one dispute, so disputing again changes nothing. Throws an `AppError`: a 409 `conflict` when
 * the player has no open dispute on the match or it was voided, and a 404 `not_found` for a
 * match they did not play in.
 */
export async function withdrawDispute(
	code: MatchCode,
	{ cache = matchCache, api = appApi }: { cache?: MatchCache } & ApiOption = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/withdraw-dispute', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	return match;
}

/**
 * Seed the app-wide cache with a match the player just recorded. Pass the match as `POST matches/`
 * returned it. The backend records the submitter's team confirmation with the match (Decision Q4),
 * so the match detail shows where it stands, and says once that the player just recorded it. Call it after
 * `POST matches/` succeeds, before going to the match.
 */
export function rememberMatch(match: Match, cache: MatchCache = matchCache): void {
	cache.remember(match);
	cache.markRecorded(match.code);
}

/**
 * Vouch that a held match really happened: it is a separate match, not a repeat of the other one.
 * A vouch can't be undone. A player vouches for a match with no event they played in, and a
 * member of the event's organizer for an event match. The hold ends once each match of it is
 * vouched for. Resolves to the match as the API now has it, and remembers it. The answer doesn't
 * say whether the hold ended, so read the holds list (`findHold`) for that. Throws an `AppError`:
 * a 409 `conflict` when the match is voided or no longer held, and a 404 `not_found` for anyone
 * the backend doesn't let vouch.
 */
export async function vouchForMatch(
	code: MatchCode,
	{ cache = matchCache, api = appApi }: { cache?: MatchCache } & ApiOption = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/vouch', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	cache.markVouched(code);
	return match;
}
