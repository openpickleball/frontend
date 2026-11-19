import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { AppError, AppErrorKind } from '#lib/api/index.js';
import { buildCode, type Match, type MatchCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
import * as services from '../services.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import HomeView from './home-view.svelte';

// The services have their own tests against the mock API. Here they are stand-ins.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listMatches: vi.fn(),
	listAwaitingConfirmation: vi.fn()
}));
const mocked = vi.mocked(services);

const code = (random: string) => buildCode('match', random) as MatchCode;
const NEEDS = code('7QK2H9WD3NF');
const NEEDS_TOO = code('3FTB8ZRMK6P');
const WAITING = code('X4NC2GHJ9VQ');
const RECENT = code('D9PW5KXE7RM');

const needs = viewerMatch({ b: true }, { code: NEEDS });
const needsToo = viewerMatch({}, { code: NEEDS_TOO, playedOn: '2026-11-12' });
const waiting = viewerMatch(
	{ a: true, decision: 'confirm' },
	{ code: WAITING, playedOn: '2026-11-10' }
);
const done = viewerMatch(
	{ a: true, b: true, decision: 'confirm' },
	{ code: RECENT, status: 'confirmed', playedOn: '2026-11-08' }
);

function serve(history: Match[], awaiting: Match[], awaitingCount = awaiting.length) {
	mocked.listMatches.mockImplementation(async (_player, _offset, options) => {
		options?.cache?.rememberAll(history);
		return { items: history, count: history.length };
	});
	mocked.listAwaitingConfirmation.mockImplementation(async (_offset, options) => {
		options?.cache?.rememberAll(awaiting);
		return { items: awaiting, count: awaitingCount };
	});
}

// State is reset before each test, not after: the rendered view is still mounted when afterEach
// runs, and a reset code store would make it start loading the code.
beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.save(TAMSIN);
});

afterEach(() => {
	session.reset();
});

const heading = (name: string) => page.getByRole('heading', { level: 2, name });

describe('HomeView', () => {
	it('shows what needs the player, what waits on the other team, then recent matches', async () => {
		serve([needs, needsToo, waiting, done], [needs, needsToo]);
		await render(HomeView);

		await expect.element(heading('Needs your confirmation')).toBeVisible();
		await expect.element(heading('Waiting for the other team')).toBeVisible();
		await expect.element(heading('Recent matches')).toBeVisible();

		const needing = page.getByRole('list', { name: 'Needs your confirmation' });
		await expect.element(needing.getByTestId('match-row').first()).toBeVisible();
		expect(needing.getByTestId('match-row').elements()).toHaveLength(2);
		const waitingList = page.getByRole('list', { name: 'Waiting for the other team' });
		expect(waitingList.getByTestId('match-row').elements()).toHaveLength(1);
		// A match shows once: the recent list holds only the match that is in neither section.
		const recent = page.getByRole('list', { name: 'Recent matches' });
		expect(recent.getByTestId('match-row').elements()).toHaveLength(1);
	});

	it('does not say "pending matches" or hedge about who confirmed', async () => {
		serve([needs, waiting], [needs]);
		await render(HomeView);
		await expect.element(heading('Needs your confirmation')).toBeVisible();
		await expect.element(page.getByText(/pending matches/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/If you already confirmed/)).not.toBeInTheDocument();
	});

	it('leaves out a section with nothing in it', async () => {
		serve([done], []);
		await render(HomeView);
		await expect.element(heading('Recent matches')).toBeVisible();
		await expect.element(heading('Needs your confirmation')).not.toBeInTheDocument();
		await expect.element(heading('Waiting for the other team')).not.toBeInTheDocument();
	});

	it('shows a match that needs the player even when it is not on the first history page', async () => {
		serve([done], [needs]);
		await render(HomeView);
		await expect.element(heading('Needs your confirmation')).toBeVisible();
		const needing = page.getByRole('list', { name: 'Needs your confirmation' });
		expect(needing.getByTestId('match-row').elements()).toHaveLength(1);
	});

	it('says how many more need the player when the first page leaves some out', async () => {
		serve([needs, done], [needs], 4);
		await render(HomeView);
		await expect
			.element(page.getByTestId('more-needs'))
			.toHaveTextContent('3 more matches are waiting for you. See all matches.');
		await expect.element(page.getByRole('link', { name: 'See all matches' })).toBeVisible();
		await expect.element(page.getByText('4 matches')).toBeVisible();
	});

	it('shows no "more" line when everything fits', async () => {
		serve([needs], [needs]);
		await render(HomeView);
		await expect.element(heading('Needs your confirmation')).toBeVisible();
		await expect.element(page.getByTestId('more-needs')).not.toBeInTheDocument();
	});

	it('drops a match from "Needs your confirmation" once its cached copy shows the team confirmed', async () => {
		serve([needs], [needs]);
		await render(HomeView);
		await expect.element(heading('Needs your confirmation')).toBeVisible();
		matchCache.remember(
			viewerMatch({ a: true, b: true, decision: 'confirm' }, { code: NEEDS, status: 'confirmed' })
		);
		await expect.element(heading('Needs your confirmation')).not.toBeInTheDocument();
	});

	it('shows the empty state when the player has no matches', async () => {
		serve([], []);
		await render(HomeView);
		await expect.element(page.getByText('Loading your matches…')).not.toBeInTheDocument();
		await expect.element(heading('Needs your confirmation')).not.toBeInTheDocument();
		await expect.element(heading('Recent matches')).not.toBeInTheDocument();
	});

	it('still shows the history, with a notice and Try again, when only the awaiting list fails', async () => {
		mocked.listMatches.mockResolvedValue({ items: [waiting, done], count: 2 });
		mocked.listAwaitingConfirmation.mockRejectedValueOnce(new Error('down'));
		await render(HomeView);
		await expect.element(page.getByTestId('needs-error')).toBeVisible();
		await expect.element(heading('Waiting for the other team')).toBeVisible();
		await expect.element(heading('Recent matches')).toBeVisible();
		await expect.element(page.getByText("Your matches didn't load.")).not.toBeInTheDocument();

		mocked.listAwaitingConfirmation.mockResolvedValue({ items: [needs], count: 1 });
		await page.getByTestId('needs-error').getByRole('button', { name: 'Try again' }).click();
		await expect.element(heading('Needs your confirmation')).toBeVisible();
		await expect.element(page.getByTestId('needs-error')).not.toBeInTheDocument();
	});

	it('shows one page-wide error with Try again when the history fails', async () => {
		mocked.listMatches.mockRejectedValue(new Error('down'));
		mocked.listAwaitingConfirmation.mockResolvedValue({ items: [needs], count: 1 });
		await render(HomeView);
		await expect.element(page.getByText("Your matches didn't load.")).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).toBeVisible();
		await expect.element(page.getByText(/connection/)).not.toBeInTheDocument();
		// A problem on our side is not a lost connection, so recording stays open.
		await expect
			.element(page.getByRole('link', { name: 'Record a match' }))
			.toHaveAttribute('href', '/record');
	});

	it('says the player is offline only for a lost connection', async () => {
		mocked.listMatches.mockRejectedValue(failure('network'));
		mocked.listAwaitingConfirmation.mockResolvedValue({ items: [], count: 0 });
		await render(HomeView);
		await expect.element(page.getByText("You're offline.")).toBeVisible();
		await expect.element(page.getByText("Your matches didn't load.")).not.toBeInTheDocument();
	});

	it('links to sign in, with no Try again, when the player is signed out', async () => {
		mocked.listMatches.mockRejectedValue(failure('unauthenticated'));
		mocked.listAwaitingConfirmation.mockRejectedValue(failure('unauthenticated'));
		await render(HomeView);
		await expect.element(page.getByText("You're not signed in.")).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect
			.element(page.getByRole('alert').getByRole('button', { name: 'Try again' }))
			.not.toBeInTheDocument();
	});
});

function failure(kind: AppErrorKind): AppError {
	return { kind, status: null, code: kind, message: 'Backend text', fields: {} };
}
