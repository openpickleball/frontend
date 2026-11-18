import { isAppError } from '#lib/api/index.js';
import type { Match, PlayerCode } from '#lib/domain/index.js';
import { matchCache, type MatchCache } from './cache.svelte.js';
import { listMatches, PAGE_SIZE } from './services.js';

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
	/** True when the failure was a missing connection, so the screen can say "offline". */
	offline = $state(false);

	#run = 0;
	#cache: MatchCache;

	constructor(cache: MatchCache = matchCache) {
		this.#cache = cache;
	}

	/** The page's matches as the cache has them now, so a confirm here shows up in the list. */
	get matches(): Match[] {
		return this.items.map((match) => this.#cache.get(match.code) ?? match);
	}

	async load(player: PlayerCode, offset = 0, limit = PAGE_SIZE): Promise<void> {
		const run = ++this.#run;
		this.status = 'loading';
		try {
			const page = await listMatches(player, offset, { limit, cache: this.#cache });
			if (run !== this.#run) return;
			this.items = page.items;
			this.count = page.count;
			this.offset = offset;
			this.offline = false;
			this.status = 'ready';
		} catch (error) {
			if (run !== this.#run) return;
			this.offline = isAppError(error) && error.kind === 'network';
			this.status = 'error';
		}
	}

	/** Drop a load that is still in flight, such as when the screen goes away. */
	cancel(): void {
		this.#run++;
	}
}
