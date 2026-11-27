import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchCache, matchCache } from './cache.svelte.js';
import {
	fetcherFor,
	filterFromSearch,
	filterLabel,
	matchesQuery,
	MATCH_FILTERS
} from './filter.js';
import { needsYou } from './needs-you.svelte.js';
import * as services from './services.js';
import { TAMSIN, sampleMatch, viewerMatch } from './testing.js';

vi.mock('./services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./services.js')>()),
	listMatches: vi.fn(),
	listAwaitingConfirmation: vi.fn(),
	listMyDisputes: vi.fn(),
	listMyHolds: vi.fn()
}));
const mocked = vi.mocked(services);

afterEach(() => vi.resetAllMocks());

const search = (query: string) => new URLSearchParams(query);

describe('filterFromSearch', () => {
	it('reads each filter', () => {
		expect(filterFromSearch(search('show=needs-you'))).toBe('needs-you');
		expect(filterFromSearch(search('show=disputed'))).toBe('disputed');
		expect(filterFromSearch(search('show=on-hold'))).toBe('on-hold');
		expect(filterFromSearch(search('show=all'))).toBe('all');
	});

	it('falls back to all when show is missing or unknown', () => {
		expect(filterFromSearch(search(''))).toBe('all');
		expect(filterFromSearch(search('show='))).toBe('all');
		expect(filterFromSearch(search('show=waiting'))).toBe('all');
		expect(filterFromSearch(search('show=Disputed'))).toBe('all');
		expect(filterFromSearch(search('show=toString'))).toBe('all');
	});
});

describe('matchesQuery', () => {
	it('leaves the defaults out', () => {
		expect(matchesQuery('all')).toBe('');
		expect(matchesQuery('all', 1)).toBe('');
	});

	it('keeps the filter and the page', () => {
		expect(matchesQuery('all', 2)).toBe('?page=2');
		expect(matchesQuery('needs-you')).toBe('?show=needs-you');
		expect(matchesQuery('disputed', 3)).toBe('?show=disputed&page=3');
	});

	it('reads back as the same filter', () => {
		for (const { value } of MATCH_FILTERS) {
			expect(filterFromSearch(search(matchesQuery(value, 2).slice(1)))).toBe(value);
		}
	});
});

describe('filterLabel', () => {
	it('names each filter, with no Waiting for the other team', () => {
		expect(MATCH_FILTERS.map(({ value }) => filterLabel(value))).toEqual([
			'All',
			'Needs you',
			'Disputed',
			'On hold'
		]);
	});
});

describe('fetcherFor', () => {
	const cache = new MatchCache(() => TAMSIN);
	const options = { limit: 20, cache };
	const match = sampleMatch();

	it('reads the history for all', async () => {
		mocked.listMatches.mockResolvedValue({ items: [match], count: 26 });
		expect(await fetcherFor('all')(TAMSIN, 20, options)).toEqual({ items: [match], count: 26 });
		expect(mocked.listMatches).toHaveBeenCalledWith(TAMSIN, 20, options);
	});

	it('pages through the app-wide Needs you list for needs-you', async () => {
		matchCache.reset();
		needsYou.reset();
		matchCache.setOwnerSource(() => TAMSIN);
		const older = viewerMatch({}, { playedOn: '2026-11-01' });
		mocked.listAwaitingConfirmation.mockImplementation(async (_offset, { cache } = {}) => {
			cache?.rememberAll([older]);
			return { items: [older], count: 1 };
		});
		mocked.listMyHolds.mockResolvedValue({ items: [], count: 0 });
		expect(await fetcherFor('needs-you')(TAMSIN, 0, options)).toEqual({
			items: [older],
			count: 1
		});
		expect(await fetcherFor('needs-you')(TAMSIN, 20, options)).toEqual({ items: [], count: 1 });
		// The app-wide cache, not the one passed in, so the count is the nav badge's count.
		expect(mocked.listAwaitingConfirmation).toHaveBeenCalledWith(0, {
			limit: 100,
			cache: matchCache
		});
		matchCache.reset();
	});

	it('throws the Needs you failure, so the page can say it', async () => {
		needsYou.reset();
		const down = new Error('down');
		mocked.listAwaitingConfirmation.mockRejectedValue(down);
		mocked.listMyHolds.mockResolvedValue({ items: [], count: 0 });
		await expect(fetcherFor('needs-you')(TAMSIN, 0, options)).rejects.toBe(down);
	});

	it('reads the disputes list for disputed', async () => {
		mocked.listMyDisputes.mockResolvedValue({ items: [match], count: 1 });
		await fetcherFor('disputed')(TAMSIN, 0, options);
		expect(mocked.listMyDisputes).toHaveBeenCalledWith(0, options);
	});

	it('reads the holds list for on-hold, and lists the held matches', async () => {
		mocked.listMyHolds.mockResolvedValue({ items: [{ match, vouched: true }], count: 41 });
		expect(await fetcherFor('on-hold')(TAMSIN, 40, options)).toEqual({
			items: [match],
			count: 41
		});
		expect(mocked.listMyHolds).toHaveBeenCalledWith(40, options);
	});
});
