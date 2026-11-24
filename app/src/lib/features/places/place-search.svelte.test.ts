import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacesError, type Place } from './photon';
import { PLACE_SEARCH_DELAY, PlaceSearch } from './place-search.svelte';

const AUSTIN: Place = {
	city: 'Austin',
	region: 'Texas',
	country: 'United States',
	label: 'Austin, Texas, United States'
};

type SearchFn = (text: string, options?: { signal?: AbortSignal }) => Promise<Place[]>;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('PlaceSearch', () => {
	it('waits for a pause, then searches once for the last text', async () => {
		const search = vi.fn<SearchFn>(async () => [AUSTIN]);
		const places = new PlaceSearch({ search });
		places.query('Au');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY - 1);
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY - 1);
		expect(search).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(search).toHaveBeenCalledTimes(1);
		expect(search.mock.calls[0][0]).toBe('Aus');
		expect(places.status).toBe('results');
		expect(places.items).toEqual([AUSTIN]);
		expect(places.message).toBe('');
	});

	it('waits 300 milliseconds', () => {
		expect(PLACE_SEARCH_DELAY).toBe(300);
	});

	it('sends nothing for fewer than two characters, and clears the results', async () => {
		const search = vi.fn<SearchFn>(async () => [AUSTIN]);
		const places = new PlaceSearch({ search });
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		expect(places.items).toHaveLength(1);
		places.query(' A ');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY * 2);
		expect(search).toHaveBeenCalledTimes(1);
		expect(places.status).toBe('idle');
		expect(places.items).toEqual([]);
	});

	it('is loading while it waits for the answer', async () => {
		let resolve: (places: Place[]) => void = () => {};
		const search = vi.fn<SearchFn>(() => new Promise<Place[]>((r) => (resolve = r)));
		const places = new PlaceSearch({ search });
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		expect(places.status).toBe('loading');
		resolve([AUSTIN]);
		await vi.advanceTimersByTimeAsync(0);
		expect(places.status).toBe('results');
	});

	it('has the empty status when nothing matches', async () => {
		const places = new PlaceSearch({ search: async () => [] });
		places.query('zzzz');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		expect(places.status).toBe('empty');
		expect(places.items).toEqual([]);
	});

	it('aborts the previous request and ignores its late answer', async () => {
		const resolvers: Array<(places: Place[]) => void> = [];
		const signals: AbortSignal[] = [];
		const search = vi.fn<SearchFn>((_text, options) => {
			if (options?.signal) signals.push(options.signal);
			return new Promise<Place[]>((r) => resolvers.push(r));
		});
		const places = new PlaceSearch({ search });
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		places.query('Dall');
		expect(signals[0].aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		resolvers[1]([{ ...AUSTIN, city: 'Dallas', label: 'Dallas, Texas, United States' }]);
		await vi.advanceTimersByTimeAsync(0);
		resolvers[0]([AUSTIN]);
		await vi.advanceTimersByTimeAsync(0);
		expect(places.items.map((p) => p.city)).toEqual(['Dallas']);
	});

	it('shows the message when the search fails', async () => {
		const places = new PlaceSearch({
			search: async () => {
				throw new PlacesError();
			}
		});
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		expect(places.status).toBe('error');
		expect(places.message).toBe("We couldn't load suggestions. Try again.");
		expect(places.items).toEqual([]);
	});

	it('clear aborts a request and resets', async () => {
		let signal: AbortSignal | undefined;
		const search = vi.fn<SearchFn>((_text, options) => {
			signal = options?.signal;
			return new Promise<Place[]>(() => {});
		});
		const places = new PlaceSearch({ search });
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY);
		places.clear();
		expect(signal?.aborted).toBe(true);
		expect(places.status).toBe('idle');
		expect(places.items).toEqual([]);
		expect(places.message).toBe('');
	});

	it('clear stops a search that has not started', async () => {
		const search = vi.fn<SearchFn>(async () => [AUSTIN]);
		const places = new PlaceSearch({ search });
		places.query('Aus');
		places.clear();
		await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY * 2);
		expect(search).not.toHaveBeenCalled();
	});

	it('takes a different delay', async () => {
		const search = vi.fn<SearchFn>(async () => []);
		const places = new PlaceSearch({ search, delay: 10 });
		places.query('Aus');
		await vi.advanceTimersByTimeAsync(10);
		expect(search).toHaveBeenCalledTimes(1);
	});
});
