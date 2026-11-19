import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { AppError } from '#lib/api/index.js';
import { buildCode, type MatchCode } from '#lib/domain/index.js';
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
	getMatch: vi.fn()
}));
const mocked = vi.mocked(services);

const notFound: AppError = {
	kind: 'not_found',
	status: 404,
	code: 'not_found',
	message: 'Not found.',
	fields: {}
};

const conflict: AppError = {
	kind: 'conflict',
	status: 409,
	code: 'conflict',
	message: 'Conflict.',
	fields: {}
};

// The fresh read of the match: by default it finds the cached copy still current.
const freshRead = () => {
	mocked.getMatch.mockImplementation(async () => {
		const found = viewerMatch();
		matchCache.remember(found);
		return found;
	});
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
	freshRead();
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
		// The view reads the match when it opens. Only the read after the 409 finds it changed.
		let reads = 0;
		mocked.getMatch.mockImplementation(async () => {
			const found = viewerMatch({}, { status: reads++ === 0 ? 'pending' : 'disputed' });
			matchCache.remember(found);
			return found;
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();

		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
		expect(mocked.getMatch).toHaveBeenCalledTimes(2);
		await expect
			.element(page.getByRole('button', { name: 'Confirm score' }))
			.not.toBeInTheDocument();
	});

	it('says why when the match cannot be read again after a 409', async () => {
		mocked.confirmMatch.mockRejectedValue(conflict);
		let reads = 0;
		mocked.getMatch.mockImplementation(async () => {
			if (reads++ > 0) throw new Error('offline');
			return viewerMatch();
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();

		await expect
			.element(page.getByRole('alert').getByText(/can't be changed any more/))
			.toBeVisible();
	});

	it('shows the cached match at once, then replaces it with the fresh one', async () => {
		let answer: (match: ReturnType<typeof viewerMatch>) => void = () => {};
		mocked.getMatch.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
		await render(MatchView, { code: code() });

		// The cached copy is pending, and the read is still out.
		await expect
			.element(page.getByTestId('status-panel'))
			.toHaveAttribute('data-status', 'pending');
		expect(mocked.getMatch).toHaveBeenCalledWith(code(), { remember: false });

		const fresh = viewerMatch({}, { status: 'disputed' });
		matchCache.remember(fresh);
		answer(fresh);
		await expect
			.element(page.getByTestId('status-panel'))
			.toHaveAttribute('data-status', 'disputed');
	});

	it('keeps showing the cached match when the fresh read fails', async () => {
		mocked.getMatch.mockRejectedValue(new Error('offline'));
		await render(MatchView, { code: code() });
		await expect.element(page.getByTestId('status-panel')).toBeVisible();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		await expect.element(page.getByText('Showing a saved copy.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	});

	it('does not let a slow first read bring Confirm back after the player confirmed', async () => {
		let late: (match: ReturnType<typeof viewerMatch>) => void = () => {};
		mocked.getMatch.mockImplementation(() => new Promise((resolve) => (late = resolve)));
		mocked.confirmMatch.mockImplementation(async () => {
			const done = viewerMatch({ a: true, decision: 'confirm' });
			matchCache.remember(done);
			return done;
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Confirm score' }))
			.not.toBeInTheDocument();

		// The first read was sent before the confirm. Its answer is old.
		late(viewerMatch());
		await new Promise((done) => setTimeout(done, 50));
		await expect
			.element(page.getByRole('button', { name: 'Confirm score' }))
			.not.toBeInTheDocument();
	});

	it('ignores a 404 for the match the page just left', async () => {
		const other = sampleMatch({ code: buildCode('match', 'D9PW5KXE7RM') as MatchCode });
		let fail: (cause: unknown) => void = () => {};
		mocked.getMatch.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
		const screen = await render(MatchView, { code: code() });

		mocked.getMatch.mockImplementation(async () => {
			const found = viewerMatch({}, { code: other.code });
			matchCache.remember(found);
			return found;
		});
		await screen.rerender({ code: other.code });
		fail(notFound);

		await expect.element(page.getByTestId('status-panel')).toBeVisible();
		await expect.poll(() => document.title).toContain(other.code);
		await expect.element(page.getByText("We couldn't find this match")).not.toBeInTheDocument();
	});

	it('shows the match it read when the cache cannot keep it', async () => {
		matchCache.reset();
		mocked.getMatch.mockImplementation(async () => viewerMatch());
		await render(MatchView, { code: code() });
		await expect.element(page.getByTestId('status-panel')).toBeVisible();
	});

	it('says so when the fresh read changes what the cache showed', async () => {
		mocked.getMatch.mockImplementation(async () => {
			const found = viewerMatch({}, { status: 'disputed' });
			matchCache.remember(found);
			return found;
		});
		await render(MatchView, { code: code() });
		// The status panel takes focus, because the Confirm button that was there is gone.
		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toHaveFocus();
	});

	it('asks a signed-out player to sign in', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValue({
			kind: 'unauthenticated',
			status: 401,
			code: 'unauthorized',
			message: 'Authentication required.',
			fields: {}
		} satisfies AppError);
		await render(MatchView, { code: code() });
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	});

	it('says it is loading when there is no cached match yet', async () => {
		matchCache.reset();
		mocked.getMatch.mockImplementation(() => new Promise(() => {}));
		myCode.save(TAMSIN);
		await render(MatchView, { code: code() });
		await expect.element(page.getByText('Loading the match…')).toBeVisible();
	});

	it('shows a match opened with no cached copy once it is read', async () => {
		matchCache.reset();
		myCode.save(TAMSIN);
		await render(MatchView, { code: code() });
		await expect.element(page.getByTestId('status-panel')).toBeVisible();
		expect(mocked.getMatch).toHaveBeenCalledWith(code(), { remember: false });
	});

	it('says it could not find the match on a 404, and drops the cached copy', async () => {
		mocked.getMatch.mockRejectedValue(notFound);
		await render(MatchView, { code: code() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: "We couldn't find this match" }))
			.toBeVisible();
		await expect.element(page.getByText(/Only the players in a match can see it/)).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Back to your matches' })).toBeVisible();
		await expect.element(page.getByTestId('status-panel')).not.toBeInTheDocument();
		expect(matchCache.get(code())).toBeUndefined();
	});

	it('says the same for a code that is not a match code, with no request', async () => {
		await render(MatchView, { code: 'not-a-code' });
		await expect
			.element(page.getByRole('heading', { level: 1, name: "We couldn't find this match" }))
			.toBeVisible();
		expect(mocked.getMatch).not.toHaveBeenCalled();
	});

	it('offers to try again when the match did not load, and reads it again', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValueOnce(new Error('boom'));
		await render(MatchView, { code: code() });

		await expect.element(page.getByRole('alert').getByText(/went wrong on our side/)).toBeVisible();
		await page.getByRole('button', { name: 'Try again' }).click();

		await expect.element(page.getByTestId('status-panel')).toBeVisible();
		expect(mocked.getMatch).toHaveBeenCalledTimes(2);
	});

	it('asks to check the connection only when the read had no connection', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValueOnce({
			kind: 'network',
			status: null,
			code: 'network_error',
			message: "We can't reach the server.",
			fields: {}
		} satisfies AppError);
		await render(MatchView, { code: code() });

		await expect.element(page.getByRole('status').getByText(/needs a connection/)).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).not.toBeInTheDocument();
	});
});
