import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { goto } from '$app/navigation';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { buildCode, type MatchCode } from '#lib/domain/index.js';
import { matchCache } from '../cache.svelte.js';
import { needsYou } from '../needs-you.svelte.js';
import * as services from '../services.js';
import type { MatchFilter } from '../filter.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import HistoryView from './history-view.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listMatches: vi.fn(),
	listAwaitingConfirmation: vi.fn(),
	listMyDisputes: vi.fn(),
	listMyHolds: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}), snapshot: vi.fn() }));
const mocked = vi.mocked(services);
const renderView = (props: { page: number; show?: MatchFilter }) => render(HistoryView, props);

beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	needsYou.reset();
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
		await renderView({ page: 2 });

		await expect.element(page.getByTestId('range')).toBeVisible();
		await vi.waitFor(() => expect(document.title).toBe('Matches, page 2 of 2 · OPEN Pickleball'));
	});

	it('does not read "page 99 of 2" for a page past the end', async () => {
		mocked.listMatches.mockResolvedValue({ items: [], count: 26 });
		await renderView({ page: 99 });

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
		await renderView({ page: 1 });

		await expect
			.element(page.getByText("On hold. It doesn't count yet. Open it to vouch for it."))
			.toBeVisible();
		expect(mocked.listMyHolds).toHaveBeenCalledWith(0, { limit: 100 });
	});

	it('still shows the history when the holds list fails', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch({ b: true })], count: 1 });
		mocked.listMyHolds.mockRejectedValue(new Error('down'));
		await renderView({ page: 1 });
		await expect.element(page.getByTestId('match-row')).toBeVisible();
		// The filter has an On hold pill, so look in the row.
		await expect
			.element(page.getByTestId('match-row').getByText(/On hold/))
			.not.toBeInTheDocument();
	});
});

describe('HistoryView count', () => {
	it('gives the count in the paging range only, with no line of its own', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch({ b: true })], count: 1 });
		await renderView({ page: 1 });
		await expect.element(page.getByTestId('range')).toHaveTextContent('1–1 of 1');
		await expect.element(page.getByText(/newest first/)).not.toBeInTheDocument();
		// Who sees the matches is said on the Match history switch in the profile settings.
		await expect.element(page.getByText(/signed-in players/)).not.toBeInTheDocument();
	});
});

describe('HistoryView filter', () => {
	it('lists what needs the player, to confirm or to vouch for, oldest first, with paging', async () => {
		matchCache.setOwnerSource(() => myCode.code);
		// 20 to confirm, played on 1 to 20 November, and one held to vouch for, played earlier.
		const toConfirm = Array.from({ length: 20 }, (_, index) =>
			viewerMatch(
				{ b: true },
				{
					code: buildCode('match', String(index + 1).padStart(11, '0')) as MatchCode,
					playedOn: `2026-11-${String(index + 1).padStart(2, '0')}`
				}
			)
		);
		const held = viewerMatch(
			{ a: true, decision: 'confirm' },
			{ code: buildCode('match', 'H2ZA6TQN4CJ') as MatchCode, playedOn: '2026-10-30' }
		);
		mocked.listAwaitingConfirmation.mockImplementation(async (_offset, options) => {
			options?.cache?.rememberAll(toConfirm);
			return { items: toConfirm, count: 20 };
		});
		mocked.listMyHolds.mockImplementation(async (_offset, options) => {
			const holds = [{ match: held, vouched: false }];
			(options?.cache ?? matchCache).rememberHolds(holds);
			return { items: holds, count: 1 };
		});
		await renderView({ page: 2, show: 'needs-you' });

		// Oldest first, so the 21st is the newest one to confirm.
		await expect.element(page.getByTestId('range')).toHaveTextContent('21–21 of 21');
		await expect
			.element(page.getByTestId('match-row'))
			.toHaveAttribute('href', `/matches/${toConfirm[19].code}`);
		expect(mocked.listMatches).not.toHaveBeenCalled();
		await expect.element(page.getByRole('radio', { name: 'Needs you' })).toBeChecked();
		await expect.element(page.getByRole('list', { name: 'Your matches, Needs you' })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Newer' }))
			.toHaveAttribute('href', '/matches?show=needs-you');
		await vi.waitFor(() =>
			expect(document.title).toBe('Matches, Needs you, page 2 of 2 · OPEN Pickleball')
		);
	});

	it('puts a held match to vouch for first when it is the oldest', async () => {
		matchCache.setOwnerSource(() => myCode.code);
		const toConfirm = viewerMatch({ b: true });
		const held = viewerMatch(
			{ a: true, decision: 'confirm' },
			{ code: buildCode('match', 'H2ZA6TQN4CJ') as MatchCode, playedOn: '2026-10-30' }
		);
		mocked.listAwaitingConfirmation.mockImplementation(async (_offset, options) => {
			options?.cache?.rememberAll([toConfirm]);
			return { items: [toConfirm], count: 1 };
		});
		mocked.listMyHolds.mockImplementation(async (_offset, options) => {
			const holds = [{ match: held, vouched: false }];
			(options?.cache ?? matchCache).rememberHolds(holds);
			return { items: holds, count: 1 };
		});
		await renderView({ page: 1, show: 'needs-you' });

		await expect.element(page.getByTestId('range')).toHaveTextContent('1–2 of 2');
		const rows = page.getByTestId('match-row');
		await expect.element(rows.first().getByText("Vouch for it. It's on hold.")).toBeVisible();
		await expect.element(rows.nth(1).getByText('Confirm or dispute the score.')).toBeVisible();
	});

	it('pages within the filter', async () => {
		mocked.listMyDisputes.mockResolvedValue({ items: [viewerMatch()], count: 45 });
		await renderView({ page: 2, show: 'disputed' });

		await expect
			.element(page.getByRole('link', { name: 'Older' }))
			.toHaveAttribute('href', '/matches?show=disputed&page=3');
		await expect
			.element(page.getByRole('link', { name: 'Newer' }))
			.toHaveAttribute('href', '/matches?show=disputed');
	});

	it('lists the held matches from the holds list', async () => {
		const held = viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' });
		mocked.listMyHolds.mockResolvedValue({ items: [{ match: held, vouched: false }], count: 1 });
		await renderView({ page: 1, show: 'on-hold' });

		await expect.element(page.getByTestId('range')).toHaveTextContent('1–1 of 1');
		expect(mocked.listMyHolds).toHaveBeenCalledWith(0, expect.objectContaining({ limit: 20 }));
		// The filter says On hold, so the row doesn't say it again.
		await expect
			.element(page.getByTestId('match-row').getByText(/doesn't count yet/))
			.not.toBeInTheDocument();
	});

	it('says so when a filter has no matches, with a way to all of them', async () => {
		mocked.listMyDisputes.mockResolvedValue({ items: [], count: 0 });
		await renderView({ page: 1, show: 'disputed' });

		await expect
			.element(page.getByRole('heading', { name: 'You have no disputed matches' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'See all matches' }))
			.toHaveAttribute('href', '/matches');
	});

	it('goes to the chosen filter, from its first page, and keeps focus', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch()], count: 26 });
		await renderView({ page: 2 });

		await expect.element(page.getByTestId('range')).toBeVisible();
		const onHold = page.getByRole('radio', { name: 'On hold' });
		await onHold.click();
		expect(goto).toHaveBeenCalledWith('/matches?show=on-hold', { reset: false });
		await expect.element(onHold).toBeChecked();
		await expect.element(onHold).toHaveFocus();

		// The arrow keys move along the pills and choose as they go.
		await userEvent.keyboard('{ArrowLeft}');
		const disputed = page.getByRole('radio', { name: 'Disputed' });
		await expect.element(disputed).toHaveFocus();
		expect(goto).toHaveBeenLastCalledWith('/matches?show=disputed', { reset: false });

		await page.getByRole('radio', { name: 'All' }).click();
		expect(goto).toHaveBeenLastCalledWith('/matches', { reset: false });
	});

	it('shows the filter as a group named Show, with one pill per filter', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch()], count: 1 });
		await renderView({ page: 1 });

		const group = page.getByRole('group', { name: 'Show' });
		await expect.element(group).toBeVisible();
		await expect.element(group.getByRole('radio', { name: 'All' })).toBeChecked();
		// No Waiting for the other team, which the backend has no list for.
		const names = group
			.getByRole('radio')
			.elements()
			.map((radio) => radio.textContent?.trim());
		expect(names).toEqual(['All', 'Needs you', 'Disputed', 'On hold']);
	});
});
