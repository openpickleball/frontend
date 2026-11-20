import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import { parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { PlayerSearch, SEARCH_DELAY, nameMatches } from './player-search.svelte.js';
import type { SearchFn, SearchResult } from './search.js';

function code(raw: string): PlayerCode {
	const parsed = parsePlayerCode(raw);
	if (!parsed.ok) throw new Error('bad code');
	return parsed.value;
}
const BEA = code(PLAYERS.find((p) => p.key === 'bea')!.code);

const found = (...names: string[]): SearchResult => ({
	ok: true,
	items: names.map(() => ({ code: BEA, name: 'Bea Marlowe' }))
});

/** A search whose answers the test releases by hand, in any order. */
function manual() {
	const calls: { text: string; signal: AbortSignal; resolve: (r: SearchResult) => void }[] = [];
	const search: SearchFn = (text, options) =>
		new Promise((resolve) => {
			calls.push({ text, signal: options!.signal!, resolve });
		});
	return { search, calls };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('PlayerSearch', () => {
	it('waits for a pause, then searches once for the last text', async () => {
		const search = vi.fn<SearchFn>().mockResolvedValue(found('Bea'));
		const finder = new PlayerSearch({ search });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 50);
		finder.query('bea m');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY - 50);
		expect(search).not.toHaveBeenCalled();
		finder.query('bea ma');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(search).toHaveBeenCalledTimes(1);
		expect(search.mock.calls[0][0]).toBe('bea ma');
		expect(finder.status).toBe('results');
		expect(finder.items).toHaveLength(1);
	});

	it('does not search for fewer than 3 characters, and drops old results', async () => {
		const search = vi.fn<SearchFn>().mockResolvedValue(found('Bea'));
		const finder = new PlayerSearch({ search });
		finder.query('  be ');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY * 2);
		expect(search).not.toHaveBeenCalled();
		expect(finder.status).toBe('idle');

		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(finder.items).toHaveLength(1);
		finder.query('be');
		expect(finder.status).toBe('idle');
		expect(finder.items).toEqual([]);
	});

	it('skips text it is told is not a name', async () => {
		const search = vi.fn<SearchFn>().mockResolvedValue(found('Bea'));
		const finder = new PlayerSearch({ search, skip: (t) => t.startsWith('P-') });
		finder.query('P-M2CF-7YP');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY * 2);
		expect(search).not.toHaveBeenCalled();
	});

	it('cancels the old request and ignores its answer when it comes late', async () => {
		const { search, calls } = manual();
		const finder = new PlayerSearch({ search });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		finder.query('bea ma');
		expect(calls[0].signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(calls).toHaveLength(2);

		// The newer answer lands first, then the stale one. The stale one must not win.
		calls[1].resolve({ ok: true, items: [{ code: BEA, name: 'Newer' }] });
		await vi.advanceTimersByTimeAsync(0);
		calls[0].resolve({ ok: true, items: [{ code: BEA, name: 'Older' }] });
		await vi.advanceTimersByTimeAsync(0);
		expect(finder.items.map((i) => i.name)).toEqual(['Newer']);
	});

	it('ignores an answer that arrives after the text was cleared', async () => {
		const { search, calls } = manual();
		const finder = new PlayerSearch({ search });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		finder.query('');
		calls[0].resolve(found('Bea'));
		await vi.advanceTimersByTimeAsync(0);
		expect(finder.status).toBe('idle');
		expect(finder.items).toEqual([]);
	});

	it('says when nobody was found', async () => {
		const finder = new PlayerSearch({ search: async () => ({ ok: true, items: [] }) });
		finder.query('zzz');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(finder.status).toBe('empty');
		expect(finder.message).toBe('No players found. Check the spelling or enter their OPEN code.');
	});

	it('words a 429 with the wait, and does not ask again until it is over', async () => {
		let at = 1_000_000;
		const search = vi
			.fn<SearchFn>()
			.mockResolvedValueOnce({ ok: false, kind: 'throttled', retryAfter: 20 })
			.mockResolvedValue(found('Bea'));
		const finder = new PlayerSearch({ search, now: () => at });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(finder.status).toBe('throttled');
		expect(finder.message).toBe('Too many searches. Try again in 20 seconds.');

		finder.query('bea m');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(search).toHaveBeenCalledTimes(1);
		expect(finder.status).toBe('throttled');

		at += 21_000;
		finder.query('bea ma');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(search).toHaveBeenCalledTimes(2);
		expect(finder.status).toBe('results');
	});

	it('searches again by itself once the 429 wait is over', async () => {
		const search = vi
			.fn<SearchFn>()
			.mockResolvedValueOnce({ ok: false, kind: 'throttled', retryAfter: 30 })
			.mockResolvedValue(found('Bea'));
		const finder = new PlayerSearch({ search });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(finder.status).toBe('throttled');
		await vi.advanceTimersByTimeAsync(29_000);
		expect(search).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1_000 + SEARCH_DELAY);
		expect(search).toHaveBeenCalledTimes(2);
		expect(search.mock.calls[1][0]).toBe('bea');
		expect(finder.status).toBe('results');
	});

	it('does not search again after the wait once the text is cleared', async () => {
		const search = vi
			.fn<SearchFn>()
			.mockResolvedValue({ ok: false, kind: 'throttled', retryAfter: 5 });
		const finder = new PlayerSearch({ search });
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		finder.clear();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('drops old results that no longer fit the text while the new search runs', async () => {
		const { search, calls } = manual();
		const finder = new PlayerSearch({ search });
		finder.query('ors');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		calls[0].resolve({
			ok: true,
			items: [
				{ code: BEA, name: 'Orson Wells' },
				{ code: BEA, name: 'Morse Tandy' }
			]
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(finder.items).toHaveLength(2);

		// Still fits one of them: that one stays up, so the list does not flicker.
		finder.query('orso');
		expect(finder.items.map((i) => i.name)).toEqual(['Orson Wells']);
		// Fits neither: the list empties at once and says it is searching.
		finder.query('orszq');
		expect(finder.items).toEqual([]);
		expect(finder.status).toBe('loading');
	});

	it('matches every typed word somewhere in the name, in any case', () => {
		expect(nameMatches('Kit Ashdown', 'ASHD')).toBe(true);
		expect(nameMatches('Kit Ashdown', 'kit ash')).toBe(true);
		expect(nameMatches('Kit Ashdown', 'kit z')).toBe(false);
	});

	it('uses a minute when the 429 names no wait', async () => {
		const finder = new PlayerSearch({
			search: async () => ({ ok: false, kind: 'throttled', retryAfter: null })
		});
		finder.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(finder.message).toBe('Too many searches. Try again in a minute.');
	});

	it('gives plain messages for the other failures, and for a search that throws', async () => {
		const kinds = ['offline', 'invalid', 'signed-out', 'other'] as const;
		const seen = new Set<string>();
		for (const kind of kinds) {
			const finder = new PlayerSearch({
				search: async () => ({ ok: false, kind, retryAfter: null })
			});
			finder.query('bea');
			await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
			expect(finder.status).toBe('error');
			seen.add(finder.message);
		}
		expect(seen.size).toBe(4);

		const broken = new PlayerSearch({
			search: async () => {
				throw new Error('boom');
			}
		});
		broken.query('bea');
		await vi.advanceTimersByTimeAsync(SEARCH_DELAY);
		expect(broken.status).toBe('error');
		expect(broken.message).toContain("We couldn't search just now.");
	});
});
