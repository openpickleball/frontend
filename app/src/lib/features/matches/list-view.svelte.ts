import { isAppError, type AppErrorKind } from '#lib/api/index.js';
import type { Match, MatchPage, PlayerCode } from '#lib/domain/index.js';
import { matchCache, type MatchCache } from './cache.svelte.js';
import { listMatches, PAGE_SIZE } from './services.js';

/** Fetches one page of matches. The default is the player's history. */
export type PageFetcher = (
	player: PlayerCode,
	offset: number,
	options: { limit: number; cache: MatchCache }
) => Promise<MatchPage>;

/** `loading` before the first answer and while a page loads, `error` when it did not come. */
export type ListStatus = 'loading' | 'ready' | 'error';

/**
 * One page of the player's matches, for the home and history screens. `load()` fetches a page;
 * a newer call wins, and an older one that finishes late is dropped.
 */
export class MatchListView {
	status = $state<ListStatus>('loading');
	items = $state.raw<Match[]>([]);
	count = $state(0);
	offset = $state(0);
	/**
	 * Why the last load failed, so the screen can say the right thing: `network` is offline,
	 * `unauthenticated` needs a sign-in, and the rest is a problem on our side. Null otherwise.
	 */
	errorKind = $state<AppErrorKind | null>(null);

	/** True when the failure was a missing connection, so the screen can say "offline". */
	get offline(): boolean {
		return this.errorKind === 'network';
	}

	#run = 0;
	#cache: MatchCache;
	#fetch: PageFetcher;

	/** Pass `fetch` to list something other than the player's history. */
	constructor(cache: MatchCache = matchCache, fetch: PageFetcher = listMatches) {
		this.#cache = cache;
		this.#fetch = fetch;
	}

	/** The page's matches as the cache has them now, so a confirm here shows up in the list. */
	get matches(): Match[] {
		return this.items.map((match) => this.#cache.get(match.code) ?? match);
	}

	async load(player: PlayerCode, offset = 0, limit = PAGE_SIZE): Promise<void> {
		const run = ++this.#run;
		this.status = 'loading';
		try {
			const page = await this.#fetch(player, offset, { limit, cache: this.#cache });
			if (run !== this.#run) return;
			this.items = page.items;
			this.count = page.count;
			this.offset = offset;
			this.errorKind = null;
			this.status = 'ready';
		} catch (error) {
			if (run !== this.#run) return;
			// Anything that is not an AppError (such as a response we could not read) is on our side.
			this.errorKind = isAppError(error) ? error.kind : 'server';
			this.status = 'error';
		}
	}

	/** Drop a load that is still in flight, such as when the screen goes away. */
	cancel(): void {
		this.#run++;
	}
}
