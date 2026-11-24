/**
 * The state of the city field's suggestions, built with runes.
 *
 * `query(text)` is called on every keystroke. It waits for the player to pause, asks once,
 * and keeps only the newest answer: an older request is cancelled, and if its answer still
 * arrives it is ignored.
 */
import { searchPlaces, type Place } from './photon.js';

export type PlaceSearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/** How long to wait after the last keystroke, in milliseconds. */
export const PLACE_SEARCH_DELAY = 300;

const MIN_LENGTH = 2;
const ERROR_MESSAGE = "We couldn't load suggestions. Try again.";

export type PlaceSearchFn = (text: string, options?: { signal?: AbortSignal }) => Promise<Place[]>;

export type PlaceSearchOptions = {
	search?: PlaceSearchFn;
	delay?: number;
};

export class PlaceSearch {
	status = $state<PlaceSearchStatus>('idle');
	items = $state.raw<Place[]>([]);
	/** What to tell the player when the search failed. Empty otherwise. */
	message = $state('');

	#search: PlaceSearchFn;
	#delay: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#controller: AbortController | null = null;
	#round = 0;

	constructor({ search = searchPlaces, delay = PLACE_SEARCH_DELAY }: PlaceSearchOptions = {}) {
		this.#search = search;
		this.#delay = delay;
	}

	/** The text changed. Search for it once the player pauses. */
	query(text: string): void {
		const trimmed = text.trim();
		this.#cancel();
		if ([...trimmed].length < MIN_LENGTH) {
			this.#settle('idle', '', []);
			return;
		}
		this.#timer = setTimeout(() => void this.#run(trimmed), this.#delay);
	}

	/** Forget the results and any search under way. */
	clear(): void {
		this.#cancel();
		this.#settle('idle', '', []);
	}

	#settle(status: PlaceSearchStatus, message: string, items: Place[]): void {
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
		this.status = 'loading';
		let items: Place[];
		try {
			items = await this.#search(text, { signal: controller.signal });
		} catch {
			// An abort means a newer query took over, so only the current round reports.
			if (round === this.#round && !controller.signal.aborted) {
				this.#controller = null;
				this.#settle('error', ERROR_MESSAGE, []);
			}
			return;
		}
		if (round !== this.#round || controller.signal.aborted) return;
		this.#controller = null;
		this.#settle(items.length > 0 ? 'results' : 'empty', '', items);
	}
}
