import { describe, expect, it, vi } from 'vitest';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { MyRatings } from './my-ratings.svelte.js';
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

describe('MyRatings', () => {
	it('loads the ratings, showing loading until they arrive', async () => {
		const answer = deferred<PlayerRatings | null>();
		const fetchRatings = vi.fn(() => answer.promise);
		const mine = new MyRatings(fetchRatings);
		const done = mine.load(CODE_A);
		expect(mine.loading).toBe(true);
		answer.resolve(RATINGS);
		await done;
		expect(fetchRatings).toHaveBeenCalledWith(CODE_A);
		expect(mine.ratings).toBe(RATINGS);
		expect(mine.loading).toBe(false);
		expect(mine.failed).toBe(false);
	});

	it('keeps no ratings and no failure when the backend has none to show', async () => {
		const mine = new MyRatings(async () => null);
		await mine.load(CODE_A);
		expect(mine.ratings).toBeNull();
		expect(mine.failed).toBe(false);
	});

	it('marks the ratings as failed when the call fails', async () => {
		const mine = new MyRatings(async () => Promise.reject(new Error('offline')));
		await mine.load(CODE_A);
		expect(mine.ratings).toBeNull();
		expect(mine.failed).toBe(true);
		expect(mine.loading).toBe(false);
	});

	it('drops answers for an earlier code', async () => {
		const first = deferred<PlayerRatings | null>();
		const fetchRatings = vi.fn((code: PlayerCode) =>
			code === CODE_A ? first.promise : Promise.resolve(RATINGS)
		);
		const mine = new MyRatings(fetchRatings);

		const stale = mine.load(CODE_A);
		await mine.load(CODE_B);
		expect(mine.ratings).toBe(RATINGS);

		first.reject(new Error('late'));
		await stale;
		expect(mine.ratings).toBe(RATINGS);
		expect(mine.failed).toBe(false);
		expect(mine.loading).toBe(false);
	});

	it('clears the ratings for a missing code and after cancel ignores late answers', async () => {
		const answer = deferred<PlayerRatings | null>();
		const mine = new MyRatings(() => answer.promise);
		const done = mine.load(CODE_A);
		mine.cancel();
		answer.reject(new Error('late'));
		await done;
		expect(mine.failed).toBe(false);
		expect(mine.ratings).toBeNull();

		await mine.load(null);
		expect(mine.ratings).toBeNull();
		expect(mine.loading).toBe(false);
	});
});
