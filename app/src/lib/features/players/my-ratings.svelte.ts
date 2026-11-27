import type { PlayerCode } from '#lib/domain/index.js';
import { fetchRatings } from './services.js';
import type { PlayerRatings } from './types.js';

/** `fetchRatings` by default. `null` when the backend has no ratings to show (a 404). */
export type MyRatingsFetch = (code: PlayerCode) => Promise<PlayerRatings | null>;

/**
 * The current ratings for one code, for Home and the Ratings page. `load(code)` drops whatever
 * an earlier code was still loading, so a late answer never shows for the wrong code.
 */
export class MyRatings {
	/** `null` while loading, after a failure, or when the backend has none to show. */
	ratings = $state<PlayerRatings | null>(null);
	loading = $state(false);
	failed = $state(false);

	#fetch: MyRatingsFetch;
	#run = 0;

	constructor(fetch: MyRatingsFetch = fetchRatings) {
		this.#fetch = fetch;
	}

	/** Clear the ratings and load them for `code`. `null` only clears them. */
	async load(code: PlayerCode | null): Promise<void> {
		const run = ++this.#run;
		const current = () => run === this.#run;
		this.ratings = null;
		this.failed = false;
		this.loading = false;
		if (!code) return;

		this.loading = true;
		try {
			const found = await this.#fetch(code);
			if (current()) this.ratings = found;
		} catch {
			if (current()) this.failed = true;
		} finally {
			if (current()) this.loading = false;
		}
	}

	/** Drop answers still in flight. */
	cancel(): void {
		this.#run++;
	}
}
