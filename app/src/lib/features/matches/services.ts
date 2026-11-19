import { api as appApi, unwrap, type Api } from '#lib/api/index.js';
import {
	toMatch,
	toMatchPage,
	type Match,
	type MatchCode,
	type MatchPage,
	type PlayerCode
} from '#lib/domain/index.js';
import { matchCache, type MatchCache } from './cache.svelte.js';

let api: Api = appApi;

/** Use another API client. For tests, which need a base URL and a cookie jar in node. */
export function configureMatchesApi(next: Api = appApi): void {
	api = next;
}

/** Matches per page. The API's own maximum is larger, and 20 matches the mockups. */
export const PAGE_SIZE = 20;

/**
 * One page of the player's matches, newest first. The owner sees every status. Every match on
 * the page goes into the cache. `offset` is how many matches to skip.
 */
export async function listMatches(
	player: PlayerCode,
	offset = 0,
	{ limit = PAGE_SIZE, cache = matchCache }: { limit?: number; cache?: MatchCache } = {}
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
 * One page of the matches that wait for the signed-in player: pending, they played in them, and
 * no one on their team has confirmed. Newest first, like the history. Every match on the page
 * goes into the cache. `offset` is how many matches to skip.
 */
export async function listAwaitingConfirmation(
	offset = 0,
	{ limit = PAGE_SIZE, cache = matchCache }: { limit?: number; cache?: MatchCache } = {}
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
 * Read one match from the API and remember it. Only the match's players can read it. Anyone else,
 * and any unknown or malformed code, gets the same 404, so a `not_found` `AppError` means "not
 * yours or not there". Any other failure is an `AppError` too. It always asks the API, so it
 * gives the current state, for a first read and to refresh a cached copy. Pass
 * `remember: false` to keep it out of the cache, so the caller can drop a read that came too late.
 */
export async function getMatch(
	code: MatchCode,
	{ cache = matchCache, remember = true }: { cache?: MatchCache; remember?: boolean } = {}
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
	{ cache = matchCache }: { cache?: MatchCache } = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/confirm', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	return match;
}

/**
 * Dispute a match the player played in. It takes no reason, and the backend stores none. Repeats
 * are safe. Resolves to the match as the API now has it (`disputed`).
 */
export async function disputeMatch(
	code: MatchCode,
	{ cache = matchCache }: { cache?: MatchCache } = {}
): Promise<Match> {
	const dto = await unwrap(
		api.open.POST('/api/v1/matches/{code}/dispute', { params: { path: { code } } })
	);
	const match = toMatch(dto);
	cache.remember(match);
	return match;
}

/**
 * Seed the app-wide cache with a match the player just recorded. Pass the match as the API last
 * returned it (after the confirm for the player's own team, Decision Q4), so the match detail
 * shows where it stands. Call it after `POST matches/` succeeds, before going to the match.
 */
export function rememberMatch(match: Match, cache: MatchCache = matchCache): void {
	cache.remember(match);
}
