import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError, type AppErrorKind } from '#lib/api/index.js';
import { buildCode, type Match, type MatchCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { MyRatings, myCode } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
import { needsYou } from '../needs-you.svelte.js';
import { DISPUTED_MEANS, ON_HOLD_MEANS } from '../status.js';
import * as services from '../services.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import HomeView from './home-view.svelte';

// The services have their own tests against the mock API. Here they are stand-ins.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listMatches: vi.fn(),
	listAwaitingConfirmation: vi.fn(),
	listMyDisputes: vi.fn(),
	listMyHolds: vi.fn()
}));
const mocked = vi.mocked(services);

// The ratings come from the players feature, which has its own tests. Here they are a stand-in.
const fetchRatings = vi.fn<(code: string) => Promise<typeof RATINGS | null>>();
const RATINGS = {
	demonstration: true,
	ratings: [
		{
			format: 'singles' as const,
			value: 3.05,
			reliability: 72,
			importedReliability: null,
			established: true,
			provisional: false,
			demonstration: true,
			updatedAt: '2026-11-15T09:00:00Z'
		}
	]
};

const code = (random: string) => buildCode('match', random) as MatchCode;
const NEEDS = code('7QK2H9WD3NF');
const NEEDS_TOO = code('3FTB8ZRMK6P');
const WAITING = code('X4NC2GHJ9VQ');
const RECENT = code('D9PW5KXE7RM');
const DISPUTED = code('R5GK9WBD2XF');
const DISPUTED_TOO = code('6YEM3HNV8QT');
const HELD = code('H2ZA6TQN4CJ');
const HELD_TOO = code('N3QH7DFR5KZ');

// To confirm: one played on 14 November, one on 12 November.
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

// Tamsin disputed this one, so she can withdraw it. Another player disputed the second.
const myDispute = viewerMatch(
	{ decision: 'dispute' },
	{ code: DISPUTED, status: 'disputed', playedOn: '2026-11-03' }
);
const theirDispute = viewerMatch(
	{ a: true, decision: 'confirm' },
	{ code: DISPUTED_TOO, status: 'disputed', playedOn: '2026-11-01' }
);

// Held. Tamsin's side has not vouched for the first, and has for the second.
const held = viewerMatch(
	{ a: true, b: true, decision: 'confirm' },
	{ code: HELD, status: 'confirmed', playedOn: '2026-11-07' }
);
const heldToo = viewerMatch(
	{ a: true, decision: 'confirm' },
	{ code: HELD_TOO, playedOn: '2026-10-27' }
);

/** A paged list: each call answers with the slice its offset and limit ask for. */
function paged<T>(items: T[], remember: (items: T[]) => void) {
	return async (offset = 0, options?: { limit?: number }) => {
		const slice = items.slice(offset, offset + (options?.limit ?? 20));
		remember(slice);
		return { items: slice, count: items.length };
	};
}

function serveHolds(holds: { match: Match; vouched: boolean }[]) {
	mocked.listMyHolds.mockImplementation(paged(holds, (page) => matchCache.rememberHolds(page)));
}

function serveDisputes(disputes: Match[], count = disputes.length) {
	mocked.listMyDisputes.mockImplementation(async (_offset, options) => {
		options?.cache?.rememberAll(disputes);
		return { items: disputes, count };
	});
}

function serveAwaiting(awaiting: Match[]) {
	mocked.listAwaitingConfirmation.mockImplementation(
		paged(awaiting, (page) => matchCache.rememberAll(page))
	);
}

function serve(history: Match[], awaiting: Match[] = []) {
	mocked.listMatches.mockImplementation(async (_player, _offset, options) => {
		options?.cache?.rememberAll(history);
		return { items: history, count: history.length };
	});
	serveAwaiting(awaiting);
}

/** `count` matches to confirm, made up, played on 1, 2, 3 ... November. */
function manyToConfirm(count: number): Match[] {
	return Array.from({ length: count }, (_, index) =>
		viewerMatch(
			{ b: true },
			{
				code: code(String(index + 1).padStart(11, '0')),
				playedOn: `2026-11-${String(index + 1).padStart(2, '0')}`
			}
		)
	);
}

// State is reset before each test, not after: the rendered view is still mounted when afterEach
// runs, and a reset code store would make it start loading the code.
beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	needsYou.reset();
	myCode.reset();
	matchCache.setOwnerSource(() => myCode.code);
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = TAMSIN;
	myCode.status = 'ready';
	serveDisputes([]);
	serveHolds([]);
	fetchRatings.mockReset();
	fetchRatings.mockResolvedValue(RATINGS);
});

afterEach(() => {
	session.reset();
});

/** HomeView's props, with the ratings from the stand-in. */
const home = () => ({ ratings: new MyRatings(fetchRatings) });

const heading = (name: string) => page.getByRole('heading', { level: 2, name });
const needsList = () => page.getByRole('list', { name: 'Needs you' });
const titles = (container: HTMLElement) =>
	[...container.querySelectorAll('h2')].map((h) => h.textContent?.trim());

describe('HomeView Needs you', () => {
	it('lists what to confirm and what to vouch for, oldest first, each with its action', async () => {
		serve([needs, needsToo, waiting, done], [needs, needsToo]);
		serveHolds([{ match: held, vouched: false }]);
		const screen = await render(HomeView, home());

		await expect.poll(() => needsList().getByTestId('match-row').elements()).toHaveLength(3);
		const rows = needsList().getByTestId('match-row').elements();
		expect(rows.map((row) => row.getAttribute('href'))).toEqual([
			`/matches/${HELD}`,
			`/matches/${NEEDS_TOO}`,
			`/matches/${NEEDS}`
		]);
		expect(rows[0].textContent).toContain("Vouch for it. It's on hold.");
		expect(rows[1].textContent).toContain('Confirm or dispute the score.');
		expect(titles(screen.container)).toEqual(['Ratings', 'In progress']);
		await expect.element(page.getByRole('heading', { level: 3, name: 'Needs you' })).toBeVisible();
	});

	it('shows 3, then See all with the total, which opens the Needs you filter', async () => {
		serve([done], manyToConfirm(5));
		serveHolds([{ match: heldToo, vouched: false }]);
		await render(HomeView, home());

		await expect.poll(() => needsList().getByTestId('match-row').elements()).toHaveLength(3);
		await expect
			.element(page.getByRole('link', { name: 'See all 6' }))
			.toHaveAttribute('href', '/matches?show=needs-you');
		// The oldest first: the held match played on 27 October.
		await expect
			.element(needsList().getByTestId('match-row').first())
			.toHaveAttribute('href', `/matches/${HELD_TOO}`);
	});

	it('reads the awaiting-confirmation list to its end, past the first page', async () => {
		serve([done], manyToConfirm(130));
		await render(HomeView, home());
		await expect.element(page.getByRole('link', { name: 'See all 130' })).toBeVisible();
		expect(mocked.listAwaitingConfirmation).toHaveBeenCalledWith(0, expect.anything());
		expect(mocked.listAwaitingConfirmation).toHaveBeenCalledWith(100, expect.anything());
	});

	it('has no See all when everything fits', async () => {
		serve([needs, done], [needs]);
		await render(HomeView, home());
		await expect.element(needsList()).toBeVisible();
		await expect.element(page.getByTestId('see-all-needs')).not.toBeInTheDocument();
	});

	it("says You're all caught up when nothing needs the player", async () => {
		serve([waiting, done], []);
		serveHolds([{ match: heldToo, vouched: true }]);
		await render(HomeView, home());
		await expect.element(page.getByText("You're all caught up.")).toBeVisible();
		await expect.element(needsList()).not.toBeInTheDocument();
	});

	it('drops a match once its cached copy is confirmed, and a held one once its side vouches', async () => {
		serve([done], [needs]);
		serveHolds([{ match: held, vouched: false }]);
		await render(HomeView, home());
		await expect.poll(() => needsList().getByTestId('match-row').elements()).toHaveLength(2);

		matchCache.remember(
			viewerMatch({ a: true, b: true, decision: 'confirm' }, { code: NEEDS, status: 'confirmed' })
		);
		await expect.poll(() => needsList().getByTestId('match-row').elements()).toHaveLength(1);
		matchCache.markVouched(HELD);
		await expect.element(page.getByText("You're all caught up.")).toBeVisible();
	});

	it('still shows the rest, with a notice and Try again, when Needs you fails', async () => {
		serve([waiting, done]);
		mocked.listAwaitingConfirmation.mockRejectedValueOnce(new Error('down'));
		await render(HomeView, home());
		await expect.element(page.getByTestId('needs-error')).toBeVisible();
		await expect.element(page.getByText("We couldn't check what needs you.")).toBeVisible();
		await expect.element(page.getByTestId('all-matches')).toHaveTextContent('2 matches');
		await expect.element(page.getByText("Your matches didn't load.")).not.toBeInTheDocument();

		serveAwaiting([needs]);
		await page.getByTestId('needs-error').getByRole('button', { name: 'Try again' }).click();
		await expect.element(needsList()).toBeVisible();
		await expect.element(page.getByTestId('needs-error')).not.toBeInTheDocument();
	});
});

describe('HomeView In progress', () => {
	it('counts disputed and held matches in one line that links to each filter', async () => {
		serve([needs, myDispute, theirDispute, held, heldToo, done], [needs]);
		serveDisputes([myDispute, theirDispute]);
		serveHolds([
			{ match: held, vouched: false },
			{ match: heldToo, vouched: true }
		]);
		await render(HomeView, home());

		const line = page.getByTestId('in-progress');
		await expect.element(line).toHaveTextContent('2 disputed · 2 on hold');
		await expect
			.element(line.getByRole('link', { name: '2 disputed' }))
			.toHaveAttribute('href', '/matches?show=disputed');
		await expect
			.element(line.getByRole('link', { name: '2 on hold' }))
			.toHaveAttribute('href', '/matches?show=on-hold');
		// No count of what waits on the other team: there is no list or filter for it.
		await expect.element(line.getByText(/waiting/)).not.toBeInTheDocument();
	});

	it('explains disputed and on hold in one info popover by the title', async () => {
		serve([needs, myDispute, held, done], [needs]);
		serveDisputes([myDispute]);
		serveHolds([{ match: held, vouched: false }]);
		await render(HomeView, home());
		await page.getByRole('button', { name: 'What do disputed and on hold mean?' }).click();
		const popover = page.getByRole('dialog', { name: 'What do disputed and on hold mean?' });
		await expect.element(popover.getByText(DISPUTED_MEANS)).toBeVisible();
		await expect.element(popover.getByText(ON_HOLD_MEANS)).toBeVisible();
	});

	it('explains only the counts the line shows', async () => {
		serve([myDispute, done]);
		serveDisputes([myDispute]);
		await render(HomeView, home());
		await expect.element(page.getByTestId('in-progress')).toHaveTextContent('1 disputed');
		await expect
			.element(page.getByRole('button', { name: 'What does disputed mean?' }))
			.toBeVisible();
	});

	it('keeps counting a dispute the player can withdraw, and drops one that ended', async () => {
		serve([done]);
		serveDisputes([myDispute, theirDispute], 3);
		await render(HomeView, home());
		const line = page.getByTestId('in-progress');
		await expect.element(line).toHaveTextContent('3 disputed');

		// She withdrew, and no one else disputes it: it is pending again.
		matchCache.remember(viewerMatch({ decision: 'withdraw' }, { code: DISPUTED }));
		await expect.element(line).toHaveTextContent('2 disputed');
	});

	it('has no counts line, and no info button, when nothing is disputed or on hold', async () => {
		serve([waiting, done]);
		await render(HomeView, home());
		await expect.element(page.getByText("You're all caught up.")).toBeVisible();
		await expect.element(page.getByTestId('in-progress')).not.toBeInTheDocument();
		// Home's compact rating tiles have no info button either.
		expect(page.getByRole('button', { name: /mean\?/ }).elements()).toHaveLength(0);
	});

	it('still shows the rest, with a notice and Try again, when the disputed list fails', async () => {
		serve([waiting, done]);
		mocked.listMyDisputes.mockRejectedValueOnce(new Error('down'));
		await render(HomeView, home());
		await expect.element(page.getByTestId('disputes-error')).toBeVisible();
		await expect.element(page.getByText("We couldn't check your disputed matches.")).toBeVisible();
		await expect.element(page.getByText("You're all caught up.")).toBeVisible();

		serveDisputes([myDispute]);
		await page.getByTestId('disputes-error').getByRole('button', { name: 'Try again' }).click();
		await expect.element(page.getByTestId('in-progress')).toHaveTextContent('1 disputed');
		await expect.element(page.getByTestId('disputes-error')).not.toBeInTheDocument();
	});
});

describe('HomeView order, code, ratings and the match count', () => {
	it('shows the code, then Ratings, then In progress, with no Recent matches or Record', async () => {
		serve([needs, waiting, done], [needs]);
		const screen = await render(HomeView, home());
		await expect.element(heading('In progress')).toBeVisible();
		await expect.element(page.getByTestId('ratings')).toBeVisible();
		expect(titles(screen.container)).toEqual(['Ratings', 'In progress']);
		const strip = page.getByTestId('my-code').element();
		await expect.element(page.getByTestId('my-code')).toHaveTextContent(TAMSIN);
		const [ratings] = screen.container.querySelectorAll('section');
		expect(strip.compareDocumentPosition(ratings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		await expect.element(page.getByRole('button', { name: 'Copy code' })).toBeVisible();
		await expect.element(heading('Recent matches')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Record a match' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'All matches' })).not.toBeInTheDocument();
	});

	it("puts the player's match count next to In progress, linking to Matches", async () => {
		serve([needs, waiting, myDispute, done], [needs]);
		await render(HomeView, home());
		const link = page.getByRole('link', { name: '4 matches' });
		await expect.element(link).toHaveAttribute('href', '/matches');
		await expect.element(link).toHaveAttribute('data-testid', 'all-matches');
		const section = heading('In progress').element().closest('section');
		expect(section?.contains(link.element())).toBe(true);
	});

	it('says "1 match" for one', async () => {
		serve([done]);
		await render(HomeView, home());
		await expect.element(page.getByRole('link', { name: '1 match', exact: true })).toBeVisible();
	});

	it('shows the ratings with the demonstration sentence and a Details link to Ratings', async () => {
		serve([done]);
		await render(HomeView, home());
		const ratings = page.getByTestId('ratings');
		await expect.element(ratings.getByText('3.05')).toBeVisible();
		await expect
			.element(
				page.getByText('These are demonstration numbers while the rating method is being built.')
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Details' }))
			.toHaveAttribute('href', '/ratings');
		// Compact tiles: no reliability lines, and so no popover to explain them.
		await expect.element(ratings.getByText('Demonstration', { exact: true })).toBeVisible();
		await expect.element(ratings.getByText(/Reliability/)).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'What does reliability mean?' }))
			.not.toBeInTheDocument();
		expect(fetchRatings).toHaveBeenCalledWith(TAMSIN);
	});

	it('keeps the matches when the ratings fail, and says so in the Ratings section', async () => {
		fetchRatings.mockRejectedValue(new Error('down'));
		serve([needs, done], [needs]);
		await render(HomeView, home());
		await expect.element(page.getByText(/We can't load your ratings right now/)).toBeVisible();
		await expect.element(needsList()).toBeVisible();
	});

	it('does not say "pending matches" or hedge about who confirmed', async () => {
		serve([needs, waiting], [needs]);
		await render(HomeView, home());
		await expect.element(needsList()).toBeVisible();
		await expect.element(page.getByText(/pending matches/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/If you already confirmed/)).not.toBeInTheDocument();
	});

	it('shows the empty state, with its one Record a match, when the player has no matches', async () => {
		serve([], []);
		await render(HomeView, home());
		await expect.element(page.getByText('No matches yet')).toBeVisible();
		await expect.element(heading('In progress')).not.toBeInTheDocument();
		expect(page.getByRole('link', { name: 'Record a match' }).elements()).toHaveLength(1);
		await expect.element(page.getByTestId('my-code')).toBeVisible();
		await expect.element(heading('Ratings')).toBeVisible();
	});
});

describe('HomeView history errors', () => {
	it('shows one page-wide error with Try again when the history fails', async () => {
		mocked.listMatches.mockRejectedValue(new Error('down'));
		serveAwaiting([needs]);
		await render(HomeView, home());
		await expect.element(page.getByText("Your matches didn't load.")).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).toBeVisible();
		await expect.element(page.getByText(/connection/)).not.toBeInTheDocument();
		// The code and the ratings still show above the error.
		await expect.element(page.getByTestId('my-code')).toHaveTextContent(TAMSIN);
		await expect.element(page.getByTestId('ratings')).toBeVisible();
	});

	it('says the player is offline only for a lost connection', async () => {
		mocked.listMatches.mockRejectedValue(failure('network'));
		serveAwaiting([]);
		await render(HomeView, home());
		await expect.element(page.getByText("You're offline.")).toBeVisible();
		await expect.element(page.getByText("Your matches didn't load.")).not.toBeInTheDocument();
	});

	it('asks the player to wait, with Try again, when there were too many requests', async () => {
		mocked.listMatches.mockRejectedValue(failure('throttled'));
		serveAwaiting([]);
		await render(HomeView, home());
		await expect.element(page.getByText("Your matches didn't load.")).toBeVisible();
		await expect.element(page.getByText(/Wait a minute, then try again/)).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('alert').getByRole('button', { name: 'Try again' }))
			.toBeVisible();
	});

	it('links to sign in, with no Try again, when the player is signed out', async () => {
		mocked.listMatches.mockRejectedValue(failure('unauthenticated'));
		mocked.listAwaitingConfirmation.mockRejectedValue(failure('unauthenticated'));
		await render(HomeView, home());
		await expect.element(page.getByText("You're not signed in.")).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect
			.element(page.getByRole('alert').getByRole('button', { name: 'Try again' }))
			.not.toBeInTheDocument();
	});
});

function failure(kind: AppErrorKind): AppError {
	return new AppError({ kind, status: null, code: kind, message: 'Backend text', fields: {} });
}
