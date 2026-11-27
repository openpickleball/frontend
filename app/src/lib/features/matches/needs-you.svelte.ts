import { isAppError, type AppErrorKind } from '#lib/api/index.js';
import { needsViewerConfirmation, type Match, type MatchCode } from '#lib/domain/index.js';
import { matchCache, type HoldState, type MatchCache } from './cache.svelte.js';
import type { ListStatus } from './list-view.svelte.js';
import { listAwaitingConfirmation, listMyHolds } from './services.js';

/** What a player can do about a match that needs them. */
export type NeedsYouAction = 'confirm' | 'vouch';

/**
 * What the player can do about a match: confirm it (or dispute it) when no one on their team has,
 * and vouch for it when it is on hold and their side has not vouched. Empty when nothing.
 */
export function needsYouActions(match: Match, hold: HoldState | undefined): NeedsYouAction[] {
	if (match.status === 'voided') return [];
	const actions: NeedsYouAction[] = [];
	if (needsViewerConfirmation(match)) actions.push('confirm');
	if (hold && !hold.vouched) actions.push('vouch');
	return actions;
}

/** The codes once each, in their first order. */
function unique(codes: MatchCode[]): MatchCode[] {
	return codes.filter((code, index) => codes.indexOf(code) === index);
}

/** Oldest first: by the day it was played, then by when it was recorded. */
function oldestFirst(a: Match, b: Match): number {
	return a.playedOn.localeCompare(b.playedOn) || a.createdAt.localeCompare(b.createdAt);
}

/** The largest page each list gives, so a full read needs few requests. */
const PAGE = 100;

/**
 * The most pages a full read asks for. The loop trusts each list's `count`, so a wrong count must
 * not keep it asking forever. 1,000 matches is far more than any player has waiting.
 */
const MAX_PAGES = 10;

/** Read a paged list to its end, or to the page cap. */
async function readAll<T>(
	read: (offset: number, limit: number) => Promise<{ items: T[]; count: number }>
): Promise<T[]> {
	const all: T[] = [];
	for (let pages = 0; pages < MAX_PAGES; pages++) {
		const page = await read(all.length, PAGE);
		all.push(...page.items);
		if (page.items.length === 0 || all.length >= page.count) break;
	}
	return all;
}

/**
 * The matches that need the signed-in player: the ones to confirm and the held ones to vouch for,
 * oldest first. Home's "Needs you", the nav badge and the Matches "Needs you" filter all read this
 * one list, so their numbers agree.
 *
 * The backend has no such list, and the holds list can't say which holds the player's side has
 * vouched for. So `load()` reads `GET me/matches/awaiting-confirmation` and `GET me/matches/holds`
 * in full, page by page, and merges them here. Both lists are short by nature. A backend "needs
 * you" list would replace this.
 *
 * The lists put every match and hold in the cache, and `matches` reads them back from it. A
 * confirm or vouch on a match page updates the cache, so the match leaves the list at once. When
 * the signed-in player changes, the cache empties and so does the list.
 */
export class NeedsYouView {
	status = $state<ListStatus>('loading');
	/** Why the last load failed (see `MatchListView.errorKind`). Null otherwise. */
	errorKind = $state<AppErrorKind | null>(null);
	/** The last load's failure, so a caller that needs it can throw it again. */
	error: unknown = null;

	// Codes from both lists, and from the holds list alone.
	#codes = $state.raw<MatchCode[]>([]);
	#heldCodes = $state.raw<MatchCode[]>([]);
	#pending: Promise<void> | null = null;
	#run = 0;
	#cache: MatchCache;

	constructor(cache: MatchCache = matchCache) {
		this.#cache = cache;
	}

	get offline(): boolean {
		return this.errorKind === 'network';
	}

	/** The matches that need the player now, oldest first. */
	get matches(): Match[] {
		const cache = this.#cache;
		return this.#codes
			.map((code) => cache.get(code))
			.filter(
				(match): match is Match =>
					match !== undefined && needsYouActions(match, cache.holdOf(match.code)).length > 0
			)
			.sort(oldestFirst);
	}

	/** How many matches need the player now. */
	get count(): number {
		return this.matches.length;
	}

	/**
	 * Every match on hold that the player may vouch for, also the ones their side has vouched for,
	 * from the same full read of the holds list.
	 */
	get held(): Match[] {
		const cache = this.#cache;
		return this.#heldCodes
			.map((code) => cache.get(code))
			.filter(
				(match): match is Match =>
					match !== undefined && match.status !== 'voided' && cache.holdOf(match.code) !== undefined
			);
	}

	/**
	 * Read both lists again. A load already in flight is shared, so Home, the nav badge and the
	 * Matches filter ask once between them. It never throws: read `status` and `error`.
	 */
	load(): Promise<void> {
		if (!this.#pending) {
			const pending = this.#read().finally(() => {
				if (this.#pending === pending) this.#pending = null;
			});
			this.#pending = pending;
		}
		return this.#pending;
	}

	async #read(): Promise<void> {
		const run = ++this.#run;
		const cache = this.#cache;
		this.status = 'loading';
		try {
			const [awaiting, holds] = await Promise.all([
				readAll((offset, limit) => listAwaitingConfirmation(offset, { limit, cache })),
				readAll((offset, limit) => listMyHolds(offset, { limit, cache }))
			]);
			if (run !== this.#run) return;
			const held = holds.map((hold) => hold.match.code);
			this.#codes = unique([...awaiting.map((match) => match.code), ...held]);
			this.#heldCodes = unique(held);
			this.errorKind = null;
			this.error = null;
			this.status = 'ready';
		} catch (error) {
			if (run !== this.#run) return;
			this.error = error;
			this.errorKind = isAppError(error) ? error.kind : 'server';
			this.status = 'error';
		}
	}

	/** Forget the list, for a sign out or an account switch. A load in flight is dropped. */
	reset(): void {
		this.#run++;
		this.#pending = null;
		this.#codes = [];
		this.#heldCodes = [];
		this.errorKind = null;
		this.error = null;
		this.status = 'loading';
	}
}

/** The app-wide list, on the app-wide cache. */
export const needsYou = new NeedsYouView();
