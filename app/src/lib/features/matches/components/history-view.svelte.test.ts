import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
import * as services from '../services.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import HistoryView from './history-view.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listMatches: vi.fn(),
	listMyHolds: vi.fn()
}));
const mocked = vi.mocked(services);

beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = TAMSIN;
	myCode.status = 'ready';
	mocked.listMyHolds.mockResolvedValue({ items: [], count: 0 });
});

afterEach(() => {
	session.reset();
});

describe('HistoryView title', () => {
	it('says how many pages there are for a page in range', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch({ b: true })], count: 26 });
		await render(HistoryView, { page: 2 });

		await expect.element(page.getByTestId('range')).toBeVisible();
		await vi.waitFor(() => expect(document.title).toBe('Matches, page 2 of 2 · OPEN Pickleball'));
	});

	it('does not read "page 99 of 2" for a page past the end', async () => {
		mocked.listMatches.mockResolvedValue({ items: [], count: 26 });
		await render(HistoryView, { page: 99 });

		await expect
			.element(page.getByRole('heading', { name: 'There are no matches on this page' }))
			.toBeVisible();
		await vi.waitFor(() =>
			expect(document.title).toBe('Matches, no matches on this page · OPEN Pickleball')
		);
	});
});

describe('HistoryView holds', () => {
	it('reads the holds list so a held row says it is on hold', async () => {
		matchCache.setOwnerSource(() => myCode.code);
		const held = viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' });
		mocked.listMatches.mockImplementation(async (_player, _offset, options) => {
			options?.cache?.remember(held);
			return { items: [held], count: 1 };
		});
		mocked.listMyHolds.mockImplementation(async () => {
			matchCache.rememberHolds([{ match: held, vouched: false }]);
			return { items: [{ match: held, vouched: false }], count: 1 };
		});
		await render(HistoryView, { page: 1 });

		await expect
			.element(page.getByText("On hold. It doesn't count yet. Open it to vouch for it."))
			.toBeVisible();
		expect(mocked.listMyHolds).toHaveBeenCalledWith(0, { limit: 100 });
	});

	it('still shows the history when the holds list fails', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch({ b: true })], count: 1 });
		mocked.listMyHolds.mockRejectedValue(new Error('down'));
		await render(HistoryView, { page: 1 });
		await expect.element(page.getByTestId('match-row')).toBeVisible();
		await expect.element(page.getByText(/On hold/)).not.toBeInTheDocument();
	});
});
