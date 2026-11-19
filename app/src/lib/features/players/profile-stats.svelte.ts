import type { PlayerCode } from '#lib/domain/index.js';
import { fetchRatings } from './services.js';
import type { PlayerRatings } from './types.js';

export type ProfileStatsDeps = {
	/** How many matches the player is in. `countMatches` from `features/matches`. */
	countMatches: (code: PlayerCode) => Promise<number>;
	fetchRatings?: (code: PlayerCode) => Promise<PlayerRatings | null>;
	/** Sample ratings are shown only in the mock modes (Decision Q2). */
	sample: boolean;
};

/**
 * The numbers on the profile for one code: the match count and, in sample mode, the ratings.
 * `load(code)` drops whatever an earlier code was still loading, so a late answer never
 * shows for the wrong code.
 */
export class ProfileStats {
	matchCount = $state<number | null>(null);
	matchCountFailed = $state(false);
	ratings = $state<PlayerRatings | null>(null);
	ratingsLoading = $state(false);

	#deps: ProfileStatsDeps;
	#run = 0;

	constructor(deps: ProfileStatsDeps) {
		this.#deps = deps;
	}

	/** Clear the numbers and load them for `code`. `null` only clears them. */
	async load(code: PlayerCode | null): Promise<void> {
		const run = ++this.#run;
		const current = () => run === this.#run;
		this.matchCount = null;
		this.matchCountFailed = false;
		this.ratings = null;
		if (!code) return;

		const count = this.#deps.countMatches(code).then(
			(found) => {
				if (current()) this.matchCount = found;
			},
			() => {
				if (current()) this.matchCountFailed = true;
			}
		);
		if (!this.#deps.sample) {
			await count;
			return;
		}
		this.ratingsLoading = true;
		const ratings = (this.#deps.fetchRatings ?? fetchRatings)(code)
			.then(
				(found) => {
					if (current()) this.ratings = found;
				},
				() => {
					// The card says there is nothing to show.
				}
			)
			.finally(() => {
				if (current()) this.ratingsLoading = false;
			});
		await Promise.all([count, ratings]);
	}

	/** Drop answers still in flight. */
	cancel(): void {
		this.#run++;
	}
}
