/**
 * The state of one player slot's name search, built with runes.
 *
 * `query(text)` is called on every keystroke. It waits for the player to pause, asks the backend
 * once, and keeps only the newest answer: an older request is cancelled, and if its answer still
 * arrives it is ignored. While the next answer loads, only the old results that still match the
 * text stay up. After a 429 it does not ask again until the wait is over, then searches again.
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

const GENERIC = "We couldn't search just now. Try again, or enter their OPEN code.";

/** Does the name still fit the text? Every typed word is somewhere in it, in any case. */
export function nameMatches(name: string, text: string): boolean {
	const haystack = name.toLowerCase();
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word));
}

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
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#text = '';
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
		this.#text = trimmed;
		if (trimmed.length < MIN_SEARCH_LENGTH || this.#skip(trimmed)) {
			this.#reset();
			return;
		}
		if (this.#now() < this.#blockedUntil) {
			this.#settle('throttled', this.#blockedMessage, []);
			return;
		}
		// Old results stay up while the new ones load, so the list does not flicker. A player who
		// no longer fits the text goes at once, so they cannot be picked by mistake.
		if (this.items.length > 0) {
			const still = this.items.filter((hit) => nameMatches(hit.name, trimmed));
			if (still.length !== this.items.length) this.items = still;
			if (still.length === 0) this.status = 'loading';
		}
		this.#timer = setTimeout(() => void this.#run(trimmed), this.#delay);
	}

	/** Forget the results and any search under way. */
	clear(): void {
		this.#cancel();
		if (this.#retryTimer) clearTimeout(this.#retryTimer);
		this.#retryTimer = null;
		this.#text = '';
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
				const wait = (result.retryAfter ?? 60) * 1000;
				this.#blockedUntil = this.#now() + wait;
				this.#blockedMessage = message;
				this.#settle('throttled', message, []);
				// Once the wait is over, search again for whatever is typed then.
				if (this.#retryTimer) clearTimeout(this.#retryTimer);
				this.#retryTimer = setTimeout(() => {
					this.#retryTimer = null;
					this.#blockedUntil = 0;
					if (this.status === 'throttled') this.query(this.#text);
				}, wait);
				return;
			}
			case 'signed-out':
				this.#settle(
					'error',
					"You're signed out. Sign in again to search, or enter their OPEN code.",
					[]
				);
				return;
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
