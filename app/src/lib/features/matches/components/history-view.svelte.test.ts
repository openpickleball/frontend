import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { goto } from '$app/navigation';
import { session } from '#lib/features/auth/index.js';
import { myCode, type MySettings, type Visibility } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
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
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mocked = vi.mocked(services);
const fetchMySettings = vi.fn<() => Promise<MySettings | null>>();
const renderView = (props: { page: number; show?: MatchFilter }) =>
	render(HistoryView, { ...props, settingsDeps: { fetchMySettings } });

function settingsWith(matchHistory: Visibility): MySettings {
	return {
		displayName: 'Tamsin Vale',
		privacy: {
			match_history: matchHistory,
			stats: 'signed_in',
			rating_history: 'signed_in',
			home_club: 'signed_in',
			city_region: 'signed_in',
			rating: 'signed_in'
		}
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = TAMSIN;
	myCode.status = 'ready';
	mocked.listMyHolds.mockResolvedValue({ items: [], count: 0 });
	fetchMySettings.mockResolvedValue(settingsWith('signed_in'));
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
		// The filter menu has an On hold option, so look in the row.
		await expect
			.element(page.getByTestId('match-row').getByText(/On hold/))
			.not.toBeInTheDocument();
	});
});

describe('HistoryView who sees the matches', () => {
	beforeEach(() => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch({ b: true })], count: 1 });
	});

	it('says other signed-in players see the confirmed matches when they are shared', async () => {
		await renderView({ page: 1 });
		await expect
			.element(page.getByText(/Other signed-in players see your confirmed matches\./))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Change who sees them' }))
			.toHaveAttribute('href', expect.stringMatching(/\/profile#settings-heading$/));
	});

	it('says only the player sees the matches when they are private', async () => {
		fetchMySettings.mockResolvedValue(settingsWith('private'));
		await renderView({ page: 1 });
		await expect.element(page.getByText(/Only you can see your matches\./)).toBeVisible();
		await expect.element(page.getByText(/Other signed-in players/)).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Change who sees them' })).toBeVisible();
	});

	it('leaves the sentence and the link out when the settings do not load', async () => {
		fetchMySettings.mockRejectedValue(new Error('down'));
		await renderView({ page: 1 });
		await expect.element(page.getByText(/1 match, newest first\./)).toBeVisible();
		await expect.element(page.getByText(/Other signed-in players/)).not.toBeInTheDocument();
		await expect.element(page.getByText(/Only you can see/)).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Change who sees them' }))
			.not.toBeInTheDocument();
	});

	it('reads the settings once', async () => {
		await renderView({ page: 1 });
		await expect.element(page.getByText(/Other signed-in players/)).toBeVisible();
		expect(fetchMySettings).toHaveBeenCalledTimes(1);
	});
});

describe('HistoryView filter', () => {
	it('lists the matches that need the player, from their own list, with paging', async () => {
		mocked.listAwaitingConfirmation.mockResolvedValue({ items: [viewerMatch()], count: 21 });
		await renderView({ page: 2, show: 'needs-you' });

		await expect.element(page.getByTestId('range')).toHaveTextContent('21–21 of 21');
		expect(mocked.listAwaitingConfirmation).toHaveBeenCalledWith(20, expect.anything());
		expect(mocked.listMatches).not.toHaveBeenCalled();
		await expect.element(page.getByLabelText('Show')).toHaveValue('needs-you');
		await expect.element(page.getByRole('list', { name: 'Your matches, Needs you' })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Newer' }))
			.toHaveAttribute('href', '/matches?show=needs-you');
		await vi.waitFor(() =>
			expect(document.title).toBe('Matches, Needs you, page 2 of 2 · OPEN Pickleball')
		);
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
		await expect.element(page.getByText('1 match, newest first.', { exact: true })).toBeVisible();
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
		await userEvent.selectOptions(page.getByLabelText('Show'), 'On hold');
		expect(goto).toHaveBeenCalledWith('/matches?show=on-hold', { reset: false });
	});

	it('offers no Waiting for the other team, which the backend has no list for', async () => {
		mocked.listMatches.mockResolvedValue({ items: [viewerMatch()], count: 1 });
		await renderView({ page: 1 });

		const select = page.getByLabelText('Show');
		await expect.element(select).toHaveValue('all');
		const options = [...(select.element() as HTMLSelectElement).options].map((o) => o.text);
		expect(options).toEqual(['All', 'Needs you', 'Disputed', 'On hold']);
	});
});
