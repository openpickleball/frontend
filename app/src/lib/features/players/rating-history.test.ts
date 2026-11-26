import { describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { RatingHistoryView } from './rating-history.svelte.js';
import {
	CHANGE_KINDS,
	formatRecordedAt,
	historyRangeLabel,
	toRatingHistoryPage
} from './ratings.js';
import type { RatingChange, RatingHistoryPage } from './types.js';

const CODE_A = buildCode('player', '4RWN8TQ') as PlayerCode;
const CODE_B = buildCode('player', '9HJD3XK') as PlayerCode;

const CHANGE: RatingChange = {
	format: 'singles',
	kind: 'live_update',
	value: 3.05,
	reliability: 72,
	importedReliability: null,
	established: true,
	provisional: false,
	demonstration: true,
	recordedAt: '2026-11-15T09:00:00Z'
};

const page = (count: number, items: RatingChange[] = [CHANGE]): RatingHistoryPage => ({
	items,
	count
});

/** A promise the test settles by hand. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('RatingHistoryView', () => {
	it('loads a page, showing loading until it arrives', async () => {
		const answer = deferred<RatingHistoryPage | null>();
		const fetch = vi.fn(() => answer.promise);
		const view = new RatingHistoryView(fetch);
		const done = view.load(CODE_A);
		expect(view.status).toBe('loading');
		answer.resolve(page(8));
		await done;
		expect(fetch).toHaveBeenCalledWith(CODE_A, 0);
		expect(view.status).toBe('ready');
		expect(view.items).toEqual([CHANGE]);
		expect(view.count).toBe(8);
	});

	it('is hidden, not an error, on a 404', async () => {
		const view = new RatingHistoryView(async () => null);
		await view.load(CODE_A);
		expect(view.status).toBe('hidden');
		expect(view.errorKind).toBeNull();
	});

	it('keeps why a load failed, and Try again asks for the same page', async () => {
		const fetch = vi
			.fn<(code: PlayerCode, offset: number) => Promise<RatingHistoryPage | null>>()
			.mockResolvedValueOnce(page(8))
			.mockRejectedValueOnce(
				new AppError({
					kind: 'network',
					status: null,
					code: 'network',
					message: 'No connection.',
					fields: {}
				})
			)
			.mockResolvedValueOnce(page(8));
		const view = new RatingHistoryView(fetch);
		await view.load(CODE_A);
		await view.load(CODE_A, 5);
		expect(view.status).toBe('error');
		expect(view.errorKind).toBe('network');
		await view.retry();
		expect(fetch).toHaveBeenLastCalledWith(CODE_A, 5);
		expect(view.status).toBe('ready');
		expect(view.offset).toBe(5);
	});

	it('treats a failure that is not an AppError as on our side', async () => {
		const view = new RatingHistoryView(async () => Promise.reject(new Error('bad json')));
		await view.load(CODE_A);
		expect(view.errorKind).toBe('server');
	});

	it('drops a late answer for an earlier code', async () => {
		const slow = deferred<RatingHistoryPage | null>();
		const fast = page(1, [{ ...CHANGE, value: 3.5 }]);
		const view = new RatingHistoryView((code) =>
			code === CODE_A ? slow.promise : Promise.resolve(fast)
		);
		const first = view.load(CODE_A);
		await view.load(CODE_B);
		slow.resolve(page(8));
		await first;
		expect(view.items).toEqual(fast.items);
		expect(view.count).toBe(1);
	});

	it('clears the list when the code changes or goes away', async () => {
		const view = new RatingHistoryView(async () => page(8));
		await view.load(CODE_A, 5);
		await view.load(null);
		expect(view.status).toBe('idle');
		expect(view.items).toEqual([]);
		expect(view.offset).toBe(0);
	});
});

describe('rating history helpers', () => {
	it('keeps the backend order and count, and leaves out what the app does not know', () => {
		const item = {
			rating_format: 'singles',
			kind: 'removed',
			rating: 2.95,
			reliability: 12,
			imported_reliability: null,
			provisional: false,
			established: false,
			spec_version: '1.0.0rc1',
			demonstration: true,
			recorded_at: '2026-11-16T09:00:00Z'
		} as const;
		const result = toRatingHistoryPage({
			count: 3,
			items: [
				item,
				{ ...item, rating_format: 'quads' as 'singles' },
				{ ...item, kind: 'merge' as 'removed' }
			]
		});
		expect(result.count).toBe(3);
		expect(result.items).toEqual([
			{
				format: 'singles',
				kind: 'removed',
				value: 2.95,
				reliability: 12,
				importedReliability: null,
				established: false,
				provisional: false,
				demonstration: true,
				recordedAt: '2026-11-16T09:00:00Z'
			}
		]);
	});

	it('says what every kind of change means, without jargon', () => {
		for (const { title, text } of Object.values(CHANGE_KINDS)) {
			expect(`${title} ${text}`).not.toMatch(/replay|engine|ledger|OPEN rating|—/i);
		}
		expect(Object.keys(CHANGE_KINDS).sort()).toEqual(['live_update', 'removed', 'replay']);
	});

	it('formats the day a change was recorded', () => {
		expect(formatRecordedAt('2026-11-17T12:00:00Z')).toBe('17 Nov 2026');
		expect(formatRecordedAt('not a date')).toBe('not a date');
	});

	it('labels the range shown', () => {
		expect(historyRangeLabel(0, 5, 8)).toBe('1–5 of 8');
		expect(historyRangeLabel(5, 3, 8)).toBe('6–8 of 8');
		expect(historyRangeLabel(10, 0, 8)).toBe('0 of 8');
	});
});
