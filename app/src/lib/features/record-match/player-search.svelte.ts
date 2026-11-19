/**
 * The state of one player slot's name search, built with runes.
 *
 * `query(text)` is called on every keystroke. It waits for the player to pause, asks the backend
 * once, and keeps only the newest answer: an older request is cancelled, and if its answer still
 * arrives it is ignored. After a 429 it does not ask again until the wait is over.
 */
import {
	MIN_SEARCH_LENGTH,
	searchPlayers,
	waitText,
	type PlayerHit,
	type SearchFn
} from './search.js';

export type SearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'throttled' | 'error';

export const SEARCH_DELAY = 250;

const GENERIC = 'We could not search just now. Try again, or enter their OPEN code.';

export type PlayerSearchOptions = {
	search?: SearchFn;
	/** How long to wait after the last keystroke, in milliseconds. */
	delay?: number;
	/** The clock, in milliseconds. For tests. */
	now?: () => number;
	/** Text that is a complete code is not a name, so it is not searched. */
	skip?: (text: string) => boolean;
};

export class PlayerSearch {
	status = $state<SearchStatus>('idle');
	items = $state.raw<PlayerHit[]>([]);
	/** What to tell the player when there is nothing to pick. */
	message = $state('');

	#search: SearchFn;
	#delay: number;
	#now: () => number;
	#skip: (text: string) => boolean;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#controller: AbortController | null = null;
	#round = 0;
	#blockedUntil = 0;
	#blockedMessage = '';

	constructor(options: PlayerSearchOptions = {}) {
		this.#search = options.search ?? searchPlayers;
		this.#delay = options.delay ?? SEARCH_DELAY;
		this.#now = options.now ?? Date.now;
		this.#skip = options.skip ?? (() => false);
	}

	/** The text changed. Search for it once the player pauses. */
	query(text: string): void {
		const trimmed = text.trim();
		this.#cancel();
		if (trimmed.length < MIN_SEARCH_LENGTH || this.#skip(trimmed)) {
			this.#reset();
			return;
		}
		if (this.#now() < this.#blockedUntil) {
			this.#settle('throttled', this.#blockedMessage, []);
			return;
		}
		this.#timer = setTimeout(() => void this.#run(trimmed), this.#delay);
	}

	/** Forget the results and any search under way. */
	clear(): void {
		this.#cancel();
		this.#reset();
	}

	#reset(): void {
		this.#settle('idle', '', []);
	}

	#settle(status: SearchStatus, message: string, items: PlayerHit[]): void {
		this.status = status;
		this.message = message;
		this.items = items;
	}

	#cancel(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.#controller?.abort();
		this.#controller = null;
		// Whatever is still in flight is now out of date.
		this.#round += 1;
	}

	async #run(text: string): Promise<void> {
		this.#timer = null;
		const round = this.#round;
		const controller = new AbortController();
		this.#controller = controller;
		// Old results stay up while the new ones load, so the list does not flicker.
		this.status = this.items.length > 0 ? this.status : 'loading';
		let result;
		try {
			result = await this.#search(text, { signal: controller.signal });
		} catch {
			if (round === this.#round) {
				this.#controller = null;
				this.#settle('error', GENERIC, []);
			}
			return;
		}
		if (round !== this.#round || controller.signal.aborted) return;
		this.#controller = null;

		if (result.ok) {
			if (result.items.length > 0) this.#settle('results', '', result.items);
			else
				this.#settle('empty', 'No players found. Check the spelling or enter their OPEN code.', []);
			return;
		}
		switch (result.kind) {
			case 'throttled': {
				const message = `Too many searches. Try again ${waitText(result.retryAfter)}.`;
				this.#blockedUntil = this.#now() + (result.retryAfter ?? 60) * 1000;
				this.#blockedMessage = message;
				this.#settle('throttled', message, []);
				return;
			}
			case 'offline':
				this.#settle(
					'error',
					"We can't reach the server. Check your connection, or enter their OPEN code.",
					[]
				);
				return;
			case 'invalid':
				this.#settle(
					'error',
					'That search is not valid. Try a different name, or enter their OPEN code.',
					[]
				);
				return;
			default:
				this.#settle('error', GENERIC, []);
		}
	}
}
