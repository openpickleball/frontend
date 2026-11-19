import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchCache } from './cache.svelte.js';
import { MatchListView } from './list-view.svelte.js';
import * as services from './services.js';
import { BEA, TAMSIN, sampleMatch } from './testing.js';

vi.mock('./services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./services.js')>()),
	listMatches: vi.fn()
}));
const listMatches = vi.mocked(services.listMatches);

afterEach(() => listMatches.mockReset());

/** A promise the test settles by hand, to make a response arrive late. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const page = (count: number, status: 'pending' | 'confirmed') => ({
	items: [sampleMatch({ status })],
	count
});

describe('MatchListView', () => {
	it('drops a late answer that a newer load has replaced', async () => {
		const view = new MatchListView(new MatchCache(() => TAMSIN));
		const slow = deferred<ReturnType<typeof page>>();
		listMatches.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(7, 'confirmed'));

		const first = view.load(TAMSIN, 0);
		const second = view.load(TAMSIN, 20);
		await second;
		expect(view.count).toBe(7);
		expect(view.offset).toBe(20);
		expect(view.status).toBe('ready');

		// The first answer finally arrives. It must not overwrite the newer page.
		slow.resolve(page(99, 'pending'));
		await first;
		expect(view.count).toBe(7);
		expect(view.offset).toBe(20);
		expect(view.items[0].status).toBe('confirmed');
	});

	it('drops a late failure too', async () => {
		const view = new MatchListView(new MatchCache(() => TAMSIN));
		const slow = deferred<ReturnType<typeof page>>();
		listMatches.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(1, 'pending'));

		const first = view.load(TAMSIN);
		await view.load(TAMSIN);
		slow.reject(new Error('late'));
		await first;
		expect(view.status).toBe('ready');
	});

	it('drops an answer that arrives after cancel()', async () => {
		const view = new MatchListView(new MatchCache(() => BEA));
		const slow = deferred<ReturnType<typeof page>>();
		listMatches.mockReturnValueOnce(slow.promise);

		const loading = view.load(BEA);
		view.cancel();
		slow.resolve(page(3, 'pending'));
		await loading;
		expect(view.count).toBe(0);
	});

	it.each([
		['network', true],
		['unauthenticated', false],
		['server', false],
		['not_found', false]
	] as const)('keeps the kind of a failed load (%s)', async (kind, offline) => {
		const view = new MatchListView(new MatchCache(() => TAMSIN));
		listMatches.mockRejectedValueOnce({ kind, status: null, code: kind, message: '', fields: {} });
		await view.load(TAMSIN);
		expect(view.status).toBe('error');
		expect(view.errorKind).toBe(kind);
		expect(view.offline).toBe(offline);
	});

	it('treats a failure that is not an AppError as ours, and clears it on success', async () => {
		const view = new MatchListView(new MatchCache(() => TAMSIN));
		listMatches
			.mockRejectedValueOnce(new Error('bad data'))
			.mockResolvedValueOnce(page(1, 'pending'));
		await view.load(TAMSIN);
		expect(view.errorKind).toBe('server');
		await view.load(TAMSIN);
		expect(view.errorKind).toBeNull();
	});
});
