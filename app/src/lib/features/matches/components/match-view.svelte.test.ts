import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { AppError } from '#lib/api/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
import * as services from '../services.js';
import { TAMSIN, sampleMatch, viewerMatch } from '../testing.js';
import MatchView from './match-view.svelte';

// The services have their own tests against the mock API. Here they are stand-ins.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	confirmMatch: vi.fn(),
	disputeMatch: vi.fn(),
	findMatch: vi.fn()
}));
const mocked = vi.mocked(services);

const conflict: AppError = {
	kind: 'conflict',
	status: 409,
	code: 'conflict',
	message: 'Conflict.',
	fields: {}
};

// State is reset before each test, not after: the rendered view is still mounted when afterEach
// runs, and a reset code store would make it start loading the code.
beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.save(TAMSIN);
	matchCache.remember(viewerMatch());
});

afterEach(() => {
	session.reset();
});

const code = () => sampleMatch().code;

describe('MatchView', () => {
	it('puts focus back on the Dispute button when the dispute fails', async () => {
		mocked.disputeMatch.mockRejectedValue(new Error('network'));
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Dispute', exact: true }).click();
		await page.getByRole('button', { name: 'Dispute score' }).click();

		await expect.element(page.getByRole('alert').getByText(/couldn't dispute/)).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Dispute', exact: true })).toHaveFocus();
	});

	it('moves focus to the new status when the dispute works', async () => {
		mocked.disputeMatch.mockImplementation(async () => {
			const disputed = viewerMatch({ decision: 'dispute' }, { status: 'disputed' });
			matchCache.remember(disputed);
			return disputed;
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Dispute', exact: true }).click();
		await page.getByRole('button', { name: 'Dispute score' }).click();

		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toHaveFocus();
	});

	it('reads the match again after a 409 and shows the new status', async () => {
		mocked.confirmMatch.mockRejectedValue(conflict);
		// The view looks the match up when it opens. Only a `fresh` read finds it changed.
		mocked.findMatch.mockImplementation(async (_code, _player, options) => {
			const found = viewerMatch({}, { status: options?.fresh ? 'disputed' : 'pending' });
			matchCache.remember(found);
			return found;
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();

		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
		expect(mocked.findMatch).toHaveBeenCalledWith(code(), TAMSIN, { fresh: true });
		await expect
			.element(page.getByRole('button', { name: 'Confirm score' }))
			.not.toBeInTheDocument();
	});

	it('says why when the match cannot be read again after a 409', async () => {
		mocked.confirmMatch.mockRejectedValue(conflict);
		mocked.findMatch.mockRejectedValue(new Error('offline'));
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();

		await expect
			.element(page.getByRole('alert').getByText(/can't be changed any more/))
			.toBeVisible();
	});

	it('says a match may be older than the last 100', async () => {
		mocked.findMatch.mockResolvedValue(null);
		matchCache.reset();
		await render(MatchView, { code: code() });
		await expect.element(page.getByText(/older than your last 100 matches/)).toBeVisible();
	});
});
