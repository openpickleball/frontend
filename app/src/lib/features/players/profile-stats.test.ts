import { describe, expect, it, vi } from 'vitest';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { ProfileStats } from './profile-stats.svelte.js';
import type { PlayerRatings } from './types.js';

const CODE_A = buildCode('player', '4RWN8TQ') as PlayerCode;
const CODE_B = buildCode('player', '9HJD3XK') as PlayerCode;

const RATINGS: PlayerRatings = { ratings: [], demonstration: true };

/** A promise the test settles by hand. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('ProfileStats', () => {
	it('loads the match count and the ratings, showing loading until they arrive', async () => {
		const ratings = deferred<PlayerRatings | null>();
		const fetchRatings = vi.fn(() => ratings.promise);
		const stats = new ProfileStats({ countMatches: async () => 3, fetchRatings });
		const done = stats.load(CODE_A);
		expect(stats.ratingsLoading).toBe(true);
		ratings.resolve(RATINGS);
		await done;
		expect(fetchRatings).toHaveBeenCalledWith(CODE_A);
		expect(stats.matchCount).toBe(3);
		expect(stats.ratings).toBe(RATINGS);
		expect(stats.ratingsLoading).toBe(false);
		expect(stats.ratingsFailed).toBe(false);
	});

	it('keeps no ratings and no failure when the backend has none to show', async () => {
		const stats = new ProfileStats({
			countMatches: async () => 0,
			fetchRatings: async () => null
		});
		await stats.load(CODE_A);
		expect(stats.ratings).toBeNull();
		expect(stats.ratingsFailed).toBe(false);
	});

	it('marks the count and the ratings as failed when the calls fail', async () => {
		const stats = new ProfileStats({
			countMatches: async () => Promise.reject(new Error('offline')),
			fetchRatings: async () => Promise.reject(new Error('offline'))
		});
		await stats.load(CODE_A);
		expect(stats.matchCount).toBeNull();
		expect(stats.matchCountFailed).toBe(true);
		expect(stats.ratings).toBeNull();
		expect(stats.ratingsFailed).toBe(true);
		expect(stats.ratingsLoading).toBe(false);
	});

	it('drops answers for an earlier code', async () => {
		const first = deferred<number>();
		const firstRatings = deferred<PlayerRatings | null>();
		const countMatches = vi.fn((code: PlayerCode) =>
			code === CODE_A ? first.promise : Promise.resolve(2)
		);
		const fetchRatings = vi.fn((code: PlayerCode) =>
			code === CODE_A ? firstRatings.promise : Promise.resolve(null)
		);
		const stats = new ProfileStats({ countMatches, fetchRatings });

		const stale = stats.load(CODE_A);
		await stats.load(CODE_B);
		expect(stats.matchCount).toBe(2);

		first.resolve(99);
		firstRatings.reject(new Error('late'));
		await stale;
		expect(stats.matchCount).toBe(2);
		expect(stats.ratings).toBeNull();
		expect(stats.ratingsFailed).toBe(false);
	});

	it('clears the numbers for a missing code and after cancel ignores late answers', async () => {
		const count = deferred<number>();
		const stats = new ProfileStats({
			countMatches: () => count.promise,
			fetchRatings: async () => RATINGS
		});
		const done = stats.load(CODE_A);
		stats.cancel();
		count.reject(new Error('late'));
		await done;
		expect(stats.matchCountFailed).toBe(false);
		expect(stats.ratings).toBeNull();

		stats.matchCount = 4;
		await stats.load(null);
		expect(stats.matchCount).toBeNull();
		expect(stats.matchCountFailed).toBe(false);
		expect(stats.ratingsLoading).toBe(false);
	});
});
