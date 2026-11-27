import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { afterNavigate } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { buildCode, type MatchCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { resetOrigins } from '../back-link.svelte.js';
import { matchCache } from '../cache.svelte.js';
import * as services from '../services.js';
import { TAMSIN, sampleMatch, viewerMatch } from '../testing.js';
import MatchView from './match-view.svelte';

// The services have their own tests against the mock API. Here they are stand-ins.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	confirmMatch: vi.fn(),
	disputeMatch: vi.fn(),
	findHold: vi.fn(),
	getMatch: vi.fn(),
	vouchForMatch: vi.fn(),
	withdrawDispute: vi.fn()
}));
const mocked = vi.mocked(services);
// The back link reads the navigation that opened the page. The tests call it by hand.
type AfterNavigate = Parameters<Parameters<typeof afterNavigate>[0]>[0];
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn(), goto: vi.fn(async () => {}) }));
let arrive: (navigation: AfterNavigate) => void = () => {};

/** Open the page as SvelteKit would after a navigation from `from`. */
function arriveFrom(type: AfterNavigate['type'], from: string, routeId: string) {
	arrive({
		type,
		shallow: false,
		willUnload: false,
		complete: Promise.resolve(),
		from: { url: new URL(from, location.origin), route: { id: routeId }, params: {}, scroll: null },
		to: { url: new URL(location.href), route: { id: '/matches/[code]' }, params: {}, scroll: null }
	} as AfterNavigate);
}

// The page has no Toaster in these tests, so the toasts are read from this stand-in.
vi.mock('svelte-sonner', () => ({ toast: vi.fn() }));

const notFound = new AppError({
	kind: 'not_found',
	status: 404,
	code: 'not_found',
	message: 'Not found.',
	fields: {}
});

const conflict = new AppError({
	kind: 'conflict',
	status: 409,
	code: 'conflict',
	message: 'Conflict.',
	fields: {}
});

// The fresh read of the match: by default it finds the cached copy still current, and no hold.
const freshRead = () => {
	mocked.getMatch.mockImplementation(async () => {
		const found = viewerMatch();
		matchCache.remember(found);
		return found;
	});
	mocked.findHold.mockResolvedValue(null);
};

// State is reset before each test, not after: the rendered view is still mounted when afterEach
// runs, and a reset code store would make it start loading the code.
beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(afterNavigate).mockImplementation((callback) => (arrive = callback));
	resetOrigins();
	matchCache.reset();
	myCode.reset();
	matchCache.setOwnerSource(() => myCode.code);
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = TAMSIN;
	myCode.status = 'ready';
	matchCache.remember(viewerMatch());
	freshRead();
});

afterEach(() => {
	session.reset();
});

const code = () => sampleMatch().code;

describe('MatchView', () => {
	describe('back link', () => {
		const back = (name: string) => page.getByRole('link', { name, exact: true });

		it('links to Matches when no app page came before it', async () => {
			await render(MatchView, { code: code() });
			await expect.element(back('Matches')).toHaveAttribute('href', '/matches');
		});

		it('goes back in history to Home when the player came from Home', async () => {
			const historyBack = vi.spyOn(history, 'back').mockImplementation(() => {});
			try {
				await render(MatchView, { code: code() });
				arriveFrom('link', '/', '/');
				await expect.element(back('Home')).toHaveAttribute('href', '/');
				await back('Home').click();
				expect(historyBack).toHaveBeenCalledOnce();
			} finally {
				historyBack.mockRestore();
			}
		});

		it('keeps the Matches filter and page it came from', async () => {
			await render(MatchView, { code: code() });
			arriveFrom('link', '/matches?show=disputed&page=2', '/matches');
			await expect
				.element(back('Matches'))
				.toHaveAttribute('href', '/matches?show=disputed&page=2');
		});

		it('opens the address instead of going back after the browser back or forward button', async () => {
			const historyBack = vi.spyOn(history, 'back').mockImplementation(() => {});
			try {
				await render(MatchView, { code: code() });
				arriveFrom('popstate', '/', '/');
				await expect.element(back('Home')).toHaveAttribute('href', '/');
				const link = (await back('Home').element()) as HTMLAnchorElement;
				// Read whether the page handled the click, then stop the test page from navigating.
				let handled: boolean | undefined;
				const stop = (event: Event) => {
					handled = event.defaultPrevented;
					event.preventDefault();
				};
				document.addEventListener('click', stop);
				const event = new MouseEvent('click', { bubbles: true, cancelable: true });
				link.dispatchEvent(event);
				document.removeEventListener('click', stop);
				expect(historyBack).not.toHaveBeenCalled();
				expect(handled).toBe(false);
			} finally {
				historyBack.mockRestore();
			}
		});
	});

	it('makes the format and date the heading, with the status badge next to it', async () => {
		const screen = await render(MatchView, { code: code() });

		await expect
			.element(page.getByRole('heading', { level: 1, name: 'Doubles · Sat 14 Nov' }))
			.toBeVisible();
		await expect.element(page.getByText('Pending', { exact: true })).toBeVisible();
		const title = screen.container.querySelector('h1')!;
		// The header has no sentence headline and no score line: the scoreboard says those.
		expect(title.parentElement!.textContent).not.toMatch(/beat|11-7/);
		const badge = screen.container.querySelector('[data-slot="badge"]')!;
		const panel = screen.container.querySelector('[data-testid="status-panel"]')!;
		expect(title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(badge.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('names the browser tab by format and date', async () => {
		await render(MatchView, { code: code() });
		await expect.poll(() => document.title).toBe('Doubles, 14 Nov · OPEN Pickleball');
	});

	it('shows the match code in Details, next to Games to and Scoring', async () => {
		const screen = await render(MatchView, { code: code() });
		const details = screen.getByRole('region', { name: 'Details' });
		await expect.element(details.getByText('Match code')).toBeVisible();
		await expect.element(details.getByText(code(), { exact: true })).toBeVisible();
		await expect.element(details.getByText('Games to')).toBeVisible();
		await expect.element(details.getByText('Scoring')).toBeVisible();
	});

	describe('Event and Club', () => {
		const EVENT = { code: 'E-TEST-0001', name: 'Test Winter League', organizer: 'O-TEST-0001' };
		const CLUB = { code: 'C-TEST-0001', name: 'Test Court Club' };

		// The cached copy and the fresh read are the same match, so nothing changes under the test.
		const showing = (overrides: Parameters<typeof viewerMatch>[1]) => {
			const match = viewerMatch({}, { status: 'disputed', ...overrides });
			matchCache.remember(match);
			mocked.getMatch.mockImplementation(async () => {
				matchCache.remember(match);
				return match;
			});
		};

		const row = (details: ReturnType<typeof page.getByRole>, term: string) =>
			details.getByRole('term').filter({ hasText: new RegExp(`^${term}$`) });

		it('names the Event and the Club in Details, and offers no Correct', async () => {
			showing({ event: EVENT, club: CLUB });
			const screen = await render(MatchView, { code: code() });
			const details = screen.getByRole('region', { name: 'Details' });
			await expect.element(row(details, 'Event')).toBeVisible();
			await expect.element(details.getByText('Test Winter League', { exact: true })).toBeVisible();
			await expect.element(row(details, 'Club')).toBeVisible();
			await expect.element(details.getByText('Test Court Club', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
			await expect
				.element(page.getByRole('link', { name: 'Correct the score' }))
				.not.toBeInTheDocument();
			// The organizer's code is not something to show.
			expect(screen.container.textContent).not.toContain('O-TEST-0001');
		});

		it('names only the Club on a Club-only match, and offers no Correct', async () => {
			showing({ club: CLUB });
			const screen = await render(MatchView, { code: code() });
			const details = screen.getByRole('region', { name: 'Details' });
			await expect.element(row(details, 'Club')).toBeVisible();
			await expect.element(details.getByText('Test Court Club', { exact: true })).toBeVisible();
			await expect.element(row(details, 'Event')).not.toBeInTheDocument();
			await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
			await expect
				.element(page.getByRole('link', { name: 'Correct the score' }))
				.not.toBeInTheDocument();
		});

		it('shows neither row on a match with neither, and still offers Correct', async () => {
			showing({});
			const screen = await render(MatchView, { code: code() });
			const details = screen.getByRole('region', { name: 'Details' });
			await expect.element(details.getByText('Match code')).toBeVisible();
			await expect.element(row(details, 'Event')).not.toBeInTheDocument();
			await expect.element(row(details, 'Club')).not.toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: 'Correct the score' })).toBeVisible();
		});
	});

	it('says once that the player just recorded the match', async () => {
		matchCache.markRecorded(code());
		const first = await render(MatchView, { code: code() });
		await expect.element(page.getByText('You just recorded this match.')).toBeVisible();
		first.unmount();
		await render(MatchView, { code: code() });
		await expect.element(page.getByText('You just recorded this match.')).not.toBeInTheDocument();
	});

	it('copies the match code', async () => {
		// The toast has no Toaster in this test, so only the copy is checked.
		const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		await render(MatchView, { code: code() });
		await page.getByRole('button', { name: 'Copy match code' }).click();
		expect(write).toHaveBeenCalledWith(code());
	});

	it('puts the status panel before the score when the player has to confirm', async () => {
		const screen = await render(MatchView, { code: code() });
		const panel = screen.container.querySelector('[data-testid="status-panel"]')!;
		const board = screen.getByRole('region', { name: 'Score' }).element();
		expect(panel.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('puts the status panel before the score on a disputed match with nothing to do', async () => {
		const disputed = viewerMatch({ decision: 'none' }, { status: 'disputed' });
		matchCache.remember(disputed);
		mocked.getMatch.mockResolvedValue(disputed);
		const screen = await render(MatchView, { code: code() });
		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
		const panel = screen.container.querySelector('[data-testid="status-panel"]')!;
		const board = screen.getByRole('region', { name: 'Score' }).element();
		expect(panel.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('drops the status panel on a confirmed match that is not on hold', async () => {
		const confirmed = viewerMatch({ a: true, b: true }, { status: 'confirmed' });
		matchCache.remember(confirmed);
		mocked.getMatch.mockResolvedValue(confirmed);
		const screen = await render(MatchView, { code: code() });
		await expect.element(screen.getByRole('region', { name: 'Score' })).toBeVisible();
		await expect.element(page.getByText('Confirmed', { exact: true })).toBeVisible();
		expect(screen.container.querySelector('[data-testid="status-panel"]')).toBeNull();
	});

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

	it('moves focus to the page title when a confirm makes the match count and the panel goes', async () => {
		mocked.confirmMatch.mockImplementation(async () => {
			const confirmed = viewerMatch(
				{ a: true, b: true, decision: 'confirm' },
				{ status: 'confirmed' }
			);
			matchCache.remember(confirmed);
			return confirmed;
		});
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Confirm score' }).click();

		await expect.element(page.getByTestId('status-panel')).not.toBeInTheDocument();
		await expect.element(page.getByRole('heading', { level: 1 })).toHaveFocus();
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
		await expect.element(page.getByText(other.code, { exact: true })).toBeVisible();
		await expect.element(page.getByText("We couldn't find this match")).not.toBeInTheDocument();
	});

	it('shows the match it read when the cache cannot keep it', async () => {
		matchCache.reset();
		// With no owner the cache refuses every write, so only the response itself can show.
		matchCache.setOwnerSource(() => null);
		expect(matchCache.get(code())).toBeUndefined();
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

	it('moves focus when the read changes what the player can do, though the status stays', async () => {
		let answer: (match: ReturnType<typeof viewerMatch>) => void = () => {};
		mocked.getMatch.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
		await render(MatchView, { code: code() });
		await page.getByRole('button', { name: 'Confirm score' }).element().focus();
		// Still pending, but the player's team has confirmed, so Confirm is gone.
		const found = viewerMatch({ a: true, decision: 'confirm' });
		matchCache.remember(found);
		answer(found);
		await expect
			.element(page.getByRole('button', { name: 'Confirm score' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Waiting for the other team' }))
			.toHaveFocus();
	});

	it('does not take focus from a control the player is using', async () => {
		let answer: (match: ReturnType<typeof viewerMatch>) => void = () => {};
		mocked.getMatch.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
		await render(MatchView, { code: code() });
		const copy = page.getByRole('button', { name: 'Copy match code' });
		await copy.element().focus();
		answer(viewerMatch({}, { status: 'disputed' }));
		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toBeVisible();
		await expect.element(copy).toHaveFocus();
	});

	it('keeps the saved-copy line and focus while Try again runs, then hands focus on', async () => {
		let reads = 0;
		let answer: (match: ReturnType<typeof viewerMatch>) => void = () => {};
		mocked.getMatch.mockImplementation(() => {
			if (reads++ === 0) return Promise.reject(new Error('offline'));
			return new Promise((resolve) => (answer = resolve));
		});
		await render(MatchView, { code: code() });
		await page.getByRole('button', { name: 'Try again' }).click();

		// The line and its button stay, and focus stays on the button.
		const trying = page.getByRole('button', { name: 'Trying…' });
		await expect.element(trying).toBeVisible();
		await expect.element(trying).toHaveFocus();
		await expect.element(page.getByText('Showing a saved copy.')).toBeVisible();
		// A second click while it runs sends no second read.
		(trying.element() as HTMLElement).click();
		expect(mocked.getMatch).toHaveBeenCalledTimes(2);

		answer(viewerMatch({}, { status: 'disputed' }));
		await expect.element(page.getByText('Showing a saved copy.')).not.toBeInTheDocument();
		// The button is gone, so focus went to the status.
		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toHaveFocus();
	});

	it('keeps the Try again button out of the status region', async () => {
		mocked.getMatch.mockRejectedValue(new Error('offline'));
		await render(MatchView, { code: code() });
		const status = page.getByRole('status');
		await expect.element(status).toHaveTextContent('Showing a saved copy.');
		await expect.element(status.getByRole('button')).not.toBeInTheDocument();
	});

	it('never shows the not-found page for match B while B has a cached copy', async () => {
		const other = sampleMatch({ code: buildCode('match', 'D9PW5KXE7RM') as MatchCode });
		matchCache.remember(viewerMatch({}, { code: other.code }));
		mocked.getMatch.mockImplementation(async (wanted) => {
			if (wanted === code()) throw notFound;
			return new Promise(() => {});
		});
		const screen = await render(MatchView, { code: code() });
		await expect.element(page.getByText("We couldn't find this match")).toBeVisible();

		// B's read stays pending. Every check while it is out must see B's copy, not the not-found page.
		await screen.rerender({ code: other.code });
		expect(screen.container.textContent).not.toContain("We couldn't find this match");
		await expect.element(page.getByTestId('status-panel')).toBeVisible();
		await new Promise((done) => setTimeout(done, 50));
		expect(screen.container.textContent).not.toContain("We couldn't find this match");
	});

	it('asks a signed-out player to sign in, and returns to the match after', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValue({
			kind: 'unauthenticated',
			status: 401,
			code: 'unauthorized',
			message: 'Authentication required.',
			fields: {}
		} satisfies AppErrorFields);
		await render(MatchView, { code: code() });
		await expect
			.element(page.getByRole('link', { name: 'Sign in' }))
			.toHaveAttribute('href', `/account/login?next=${encodeURIComponent(`/matches/${code()}`)}`);
	});

	it('asks a signed-out player to sign in', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValue({
			kind: 'unauthenticated',
			status: 401,
			code: 'unauthorized',
			message: 'Authentication required.',
			fields: {}
		} satisfies AppErrorFields);
		await render(MatchView, { code: code() });
		await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	});

	it('says it is loading when there is no cached match yet', async () => {
		matchCache.reset();
		mocked.getMatch.mockImplementation(() => new Promise(() => {}));
		myCode.code = TAMSIN;
		myCode.status = 'ready';
		await render(MatchView, { code: code() });
		const status = page.getByRole('status');
		await expect.element(status).toHaveTextContent('Loading the match…');
		await expect.element(status).toHaveAttribute('aria-busy', 'true');
	});

	it('shows a match opened with no cached copy once it is read', async () => {
		matchCache.reset();
		myCode.code = TAMSIN;
		myCode.status = 'ready';
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
		} satisfies AppErrorFields);
		await render(MatchView, { code: code() });

		await expect.element(page.getByRole('status').getByText(/needs a connection/)).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).not.toBeInTheDocument();
	});

	it('asks the player to wait when there were too many requests', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValueOnce(
			new AppError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.',
				fields: {}
			})
		);
		await render(MatchView, { code: code() });

		await expect.element(page.getByText(/Wait a minute, then try again/)).toBeVisible();
		await expect.element(page.getByText(/went wrong on our side/)).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	});

	it('offers Try again when the read timed out', async () => {
		matchCache.reset();
		mocked.getMatch.mockRejectedValueOnce(
			new AppError({
				kind: 'network',
				status: null,
				code: 'timeout',
				message: 'The server is taking too long to answer. Check your connection and try again.',
				fields: {}
			})
		);
		await render(MatchView, { code: code() });

		await expect.element(page.getByRole('status').getByText(/needs a connection/)).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	});
});

describe('MatchView withdraw', () => {
	const disputedByMe = () => viewerMatch({ decision: 'dispute' }, { status: 'disputed' });

	/** The page opens on a match the player disputed, and the first read still finds it so. */
	function openDisputed() {
		matchCache.remember(disputedByMe());
		mocked.getMatch.mockImplementation(async () => {
			const found = disputedByMe();
			matchCache.remember(found);
			return found;
		});
	}

	async function withdraw() {
		await page.getByRole('button', { name: 'Withdraw my dispute' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Withdraw your dispute?' });
		await expect.element(dialog.getByText(/can't dispute this match again/)).toBeVisible();
		await dialog.getByRole('button', { name: 'Withdraw dispute' }).click();
	}

	it('puts the status panel before the score while the player can withdraw', async () => {
		openDisputed();
		const screen = await render(MatchView, { code: code() });
		await expect.element(page.getByRole('button', { name: 'Withdraw my dispute' })).toBeVisible();
		const panel = screen.container.querySelector('[data-testid="status-panel"]')!;
		const board = screen.getByRole('region', { name: 'Score' }).element();
		expect(panel.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('withdraws after the dialog, then offers Confirm but not Dispute', async () => {
		openDisputed();
		mocked.withdrawDispute.mockImplementation(async () => {
			const pending = viewerMatch({ decision: 'withdraw' });
			matchCache.remember(pending);
			return pending;
		});
		await render(MatchView, { code: code() });

		await withdraw();

		expect(mocked.withdrawDispute).toHaveBeenCalledExactlyOnceWith(code());
		await expect
			.element(page.getByRole('heading', { name: 'Is this the right score?' }))
			.toHaveFocus();
		await expect.element(page.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Dispute', exact: true }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Withdraw my dispute' }))
			.not.toBeInTheDocument();
	});

	it('shows the match still disputed when another player keeps their dispute', async () => {
		openDisputed();
		mocked.withdrawDispute.mockImplementation(async () => {
			const still = viewerMatch({ decision: 'withdraw' }, { status: 'disputed' });
			matchCache.remember(still);
			return still;
		});
		await render(MatchView, { code: code() });

		await withdraw();

		await expect.element(page.getByRole('heading', { name: 'Disputed' })).toHaveFocus();
		await expect
			.element(page.getByText(/You withdrew your dispute, but another player still says/))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Withdraw my dispute' }))
			.not.toBeInTheDocument();
	});

	it('Cancel withdraws nothing and puts focus back on the button', async () => {
		openDisputed();
		await render(MatchView, { code: code() });

		await page.getByRole('button', { name: 'Withdraw my dispute' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(mocked.withdrawDispute).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'Withdraw my dispute' })).toHaveFocus();
	});

	it('reads the match again after a 409 and says why nothing was withdrawn', async () => {
		openDisputed();
		mocked.withdrawDispute.mockRejectedValue(conflict);
		let reads = 0;
		mocked.getMatch.mockImplementation(async () => {
			const found =
				reads++ === 0 ? disputedByMe() : viewerMatch({ decision: 'dispute' }, { status: 'voided' });
			matchCache.remember(found);
			return found;
		});
		await render(MatchView, { code: code() });

		await withdraw();

		await expect.element(page.getByRole('heading', { name: 'Voided' })).toBeVisible();
		expect(mocked.getMatch).toHaveBeenCalledTimes(2);
		await expect
			.element(page.getByRole('alert').getByText(/no dispute of yours to withdraw/))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Withdraw my dispute' }))
			.not.toBeInTheDocument();
	});

	it('says so after a 409 when the match cannot be read again, and keeps focus on the button', async () => {
		openDisputed();
		mocked.withdrawDispute.mockRejectedValue(conflict);
		let reads = 0;
		mocked.getMatch.mockImplementation(async () => {
			if (reads++ > 0) throw new Error('offline');
			return disputedByMe();
		});
		await render(MatchView, { code: code() });

		await withdraw();

		await expect
			.element(page.getByRole('alert').getByText(/no dispute of yours to withdraw/))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Withdraw my dispute' })).toHaveFocus();
	});

	for (const [kind, status] of [
		['not_found', 404],
		['forbidden', 403]
	] as const) {
		it(`says only a player in the match can withdraw on a ${status}`, async () => {
			openDisputed();
			mocked.withdrawDispute.mockRejectedValue(
				new AppError({ kind, status, code: kind, message: 'No.', fields: {} })
			);
			await render(MatchView, { code: code() });

			await withdraw();

			await expect
				.element(
					page
						.getByRole('alert')
						.getByText('You can only withdraw a dispute on a match you played in.')
				)
				.toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Withdraw my dispute' })).toHaveFocus();
		});
	}

	it('asks to try again when the withdraw fails for another reason', async () => {
		openDisputed();
		mocked.withdrawDispute.mockRejectedValue(new Error('network'));
		await render(MatchView, { code: code() });

		await withdraw();

		await expect
			.element(page.getByRole('alert').getByText("We couldn't withdraw your dispute. Try again."))
			.toBeVisible();
	});
});

describe('MatchView vouch', () => {
	const confirmed = () =>
		viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' });

	/** What the holds list says, as `findHold` puts it in the cache. */
	function holdsSay(
		vouched: boolean | null,
		match: () => ReturnType<typeof confirmed> = confirmed
	) {
		mocked.findHold.mockImplementation(async (code) => {
			if (vouched === null) {
				matchCache.endHold(code);
				return null;
			}
			const hold = { match: match(), vouched };
			matchCache.rememberHolds([hold]);
			return hold;
		});
	}

	/** The page opens on a confirmed match the holds list has, not vouched for yet. */
	function openHeld() {
		matchCache.rememberHolds([{ match: confirmed(), vouched: false }]);
		mocked.getMatch.mockImplementation(async () => {
			const found = confirmed();
			matchCache.remember(found);
			return found;
		});
		holdsSay(false);
	}

	async function vouch() {
		await page.getByRole('button', { name: 'This match really happened' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Vouch for this match?' });
		await expect.element(dialog.getByText(/You can't undo a vouch/)).toBeVisible();
		await dialog.getByRole('button', { name: 'Vouch for match' }).click();
	}

	it('says a held match is on hold, with a badge, before the score', async () => {
		openHeld();
		const screen = await render(MatchView, { code: code() });
		await expect.element(page.getByRole('heading', { name: 'On hold' })).toBeVisible();
		const badges = [...screen.container.querySelectorAll('[data-slot="badge"]')];
		expect(badges.map((badge) => badge.textContent?.trim())).toEqual(['Confirmed', 'On hold']);
		const panel = screen.container.querySelector('[data-testid="status-panel"]')!;
		const board = screen.getByRole('region', { name: 'Score' }).element();
		expect(panel.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('finds the hold itself when the page opens with no cached hold', async () => {
		holdsSay(false);
		await render(MatchView, { code: code() });
		await expect.element(page.getByRole('heading', { name: 'On hold' })).toBeVisible();
		expect(mocked.findHold).toHaveBeenCalledWith(code());
		await expect
			.element(page.getByRole('button', { name: 'This match really happened' }))
			.toBeVisible();
	});

	it('still shows the match when the holds list fails', async () => {
		mocked.findHold.mockRejectedValue(new Error('offline'));
		await render(MatchView, { code: code() });
		await expect
			.element(page.getByRole('heading', { name: 'Is this the right score?' }))
			.toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'On hold' })).not.toBeInTheDocument();
	});

	it('shows an event match from the holds list to an organizer, whom the match read refuses', async () => {
		matchCache.reset();
		matchCache.setOwnerSource(() => myCode.code);
		mocked.getMatch.mockRejectedValue(notFound);
		holdsSay(false, () => sampleMatch({ status: 'confirmed' }));
		await render(MatchView, { code: code() });
		await expect.element(page.getByRole('heading', { name: 'On hold' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'This match really happened' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: "We couldn't find this match" }))
			.not.toBeInTheDocument();
	});

	it('vouches after the dialog, then says the hold waits on the others', async () => {
		openHeld();
		mocked.vouchForMatch.mockImplementation(async () => {
			const found = confirmed();
			matchCache.remember(found);
			matchCache.markVouched(found.code);
			return found;
		});
		await render(MatchView, { code: code() });
		holdsSay(true);

		await vouch();

		expect(mocked.vouchForMatch).toHaveBeenCalledExactlyOnceWith(code());
		await expect.element(page.getByRole('heading', { name: 'On hold' })).toHaveFocus();
		await expect.element(page.getByText(/Your team vouched for this match/)).toBeVisible();
		expect(toast).toHaveBeenCalledWith('Vouched. The hold ends once the others vouch too.');
		await expect
			.element(page.getByRole('button', { name: 'This match really happened' }))
			.not.toBeInTheDocument();
	});

	it('says the hold ended when the vouch was the last one', async () => {
		openHeld();
		mocked.vouchForMatch.mockImplementation(async () => {
			const found = confirmed();
			matchCache.remember(found);
			return found;
		});
		await render(MatchView, { code: code() });
		holdsSay(null);

		await vouch();

		// A confirmed match with no hold drops the panel, so the page title takes focus.
		await expect.element(page.getByRole('heading', { level: 1 })).toHaveFocus();
		await expect.element(page.getByTestId('status-panel')).not.toBeInTheDocument();
		expect(toast).toHaveBeenCalledWith('Vouched. The hold has ended and the match now counts.');
		await expect.element(page.getByText('On hold', { exact: true })).not.toBeInTheDocument();
	});

	it('Cancel vouches for nothing and puts focus back on the button', async () => {
		openHeld();
		await render(MatchView, { code: code() });
		await page.getByRole('button', { name: 'This match really happened' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(mocked.vouchForMatch).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole('button', { name: 'This match really happened' }))
			.toHaveFocus();
	});

	it('reads the match again after a 409 and says it is not on hold any more', async () => {
		openHeld();
		mocked.vouchForMatch.mockRejectedValue(conflict);
		await render(MatchView, { code: code() });
		holdsSay(null);

		await vouch();

		await expect.element(page.getByRole('heading', { name: 'Confirmed' })).toBeVisible();
		await expect
			.element(page.getByRole('alert').getByText(/This match isn't on hold any more/))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'This match really happened' }))
			.not.toBeInTheDocument();
	});

	for (const [kind, status] of [
		['not_found', 404],
		['forbidden', 403]
	] as const) {
		it(`says who can vouch on a ${status}, and keeps focus on the button`, async () => {
			openHeld();
			mocked.vouchForMatch.mockRejectedValue(
				new AppError({ kind, status, code: kind, message: 'No.', fields: {} })
			);
			await render(MatchView, { code: code() });

			await vouch();

			await expect
				.element(page.getByRole('alert').getByText(/You can't vouch for this match\./))
				.toBeVisible();
			await expect
				.element(page.getByRole('button', { name: 'This match really happened' }))
				.toHaveFocus();
		});
	}

	it('asks to try again when the vouch fails for another reason', async () => {
		openHeld();
		mocked.vouchForMatch.mockRejectedValue(new Error('network'));
		await render(MatchView, { code: code() });

		await vouch();

		await expect
			.element(page.getByRole('alert').getByText("We couldn't vouch for this match. Try again."))
			.toBeVisible();
	});

	describe('correcting the score', () => {
		const NEW = buildCode('match', 'FXD00000001') as MatchCode;

		it('links Correct the score to the correction page', async () => {
			await render(MatchView, { code: code() });
			await expect
				.element(page.getByRole('link', { name: 'Correct the score' }))
				.toHaveAttribute('href', `/matches/${code()}/correct`);
		});

		it('says once that the player just corrected the match', async () => {
			matchCache.markCorrected(code(), NEW);
			const first = await render(MatchView, { code: code() });
			await expect.element(page.getByText(/You just corrected this match/)).toBeVisible();
			first.unmount();
			await render(MatchView, { code: code() });
			await expect.element(page.getByText(/You just corrected this match/)).not.toBeInTheDocument();
		});

		it('links the voided old match to its correction', async () => {
			const old = viewerMatch({}, { status: 'voided' });
			mocked.getMatch.mockResolvedValue(old);
			matchCache.markCorrected(NEW, code());
			await render(MatchView, { code: code() });
			await expect.element(page.getByRole('heading', { name: 'Voided' })).toBeVisible();
			await expect
				.element(page.getByRole('link', { name: 'See the corrected match' }))
				.toHaveAttribute('href', `/matches/${NEW}`);
		});
	});
});
