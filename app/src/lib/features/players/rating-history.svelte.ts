import { isAppError, type AppErrorKind } from '#lib/api/index.js';
import type { PlayerCode } from '#lib/domain/index.js';
import { fetchRatingHistory } from './services.js';
import type { RatingChange, RatingHistoryPage } from './types.js';

/** Fetches one page of rating history. `null` when the backend has none to show (a 404). */
export type HistoryFetcher = (
	code: PlayerCode,
	offset: number
) => Promise<RatingHistoryPage | null>;

/**
 * `loading` before an answer and while a page loads. `hidden` is the 404: an unknown code, an
 * inactive account or history the player keeps private. `error` is any other failure.
 */
export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'hidden' | 'error';

/**
 * One page of a player's rating history, for the profile. `load(code, offset)` fetches a page; a
 * newer call wins, and an older one that finishes late is dropped.
 */
export class RatingHistoryView {
	status = $state<HistoryStatus>('idle');
	items = $state.raw<RatingChange[]>([]);
	count = $state(0);
	offset = $state(0);
	/** Why the last load failed. Null unless `status` is `error`. */
	errorKind = $state<AppErrorKind | null>(null);

	#run = 0;
	#fetch: HistoryFetcher;
	#code: PlayerCode | null = null;
	/** The offset of the last page asked for, so Try again asks for the same one. */
	#asked = 0;

	constructor(fetch: HistoryFetcher = fetchRatingHistory) {
		this.#fetch = fetch;
	}

	/** Load the page at `offset` for `code`. `null` only clears the list. */
	async load(code: PlayerCode | null, offset = 0): Promise<void> {
		const run = ++this.#run;
		if (code !== this.#code) {
			this.items = [];
			this.count = 0;
			this.offset = 0;
		}
		this.#code = code;
		this.#asked = offset;
		this.errorKind = null;
		if (!code) {
			this.status = 'idle';
			return;
		}
		this.status = 'loading';
		try {
			const page = await this.#fetch(code, offset);
			if (run !== this.#run) return;
			if (!page) {
				this.items = [];
				this.count = 0;
				this.status = 'hidden';
				return;
			}
			this.items = page.items;
			this.count = page.count;
			this.offset = offset;
			this.status = 'ready';
		} catch (error) {
			if (run !== this.#run) return;
			// Anything that is not an AppError (such as a response we could not read) is on our side.
			this.errorKind = isAppError(error) ? error.kind : 'server';
			this.status = 'error';
		}
	}

	/** Ask for the last page again, after a failure. */
	retry(): Promise<void> {
		return this.load(this.#code, this.#asked);
	}

	/** Drop a load that is still in flight, such as when the page goes away. */
	cancel(): void {
		this.#run++;
	}
}
