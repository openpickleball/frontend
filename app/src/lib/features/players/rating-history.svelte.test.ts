import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorKind } from '#lib/api/index.js';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import RatingHistory from './rating-history.svelte';
import { RatingHistoryView, type HistoryFetcher } from './rating-history.svelte.js';
import type { RatingChange, RatingHistoryPage } from './types.js';

const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

function change(more: Partial<RatingChange>): RatingChange {
	return {
		format: 'singles',
		kind: 'live_update',
		value: 3.05,
		reliability: 72,
		importedReliability: null,
		established: true,
		provisional: false,
		demonstration: true,
		recordedAt: '2026-11-15T12:00:00Z',
		...more
	};
}

const CHANGES: RatingChange[] = [
	change({ format: 'mixed_doubles', value: 3.42, reliability: 65.4 }),
	change({ format: 'doubles_women', kind: 'replay', value: 3.31, importedReliability: 30 }),
	change({ kind: 'removed', value: 2.95, reliability: 12, recordedAt: '2026-11-16T12:00:00Z' }),
	change({ format: 'mixed_doubles', value: 3.38 }),
	change({ format: 'mixed_doubles', value: 3.4 }),
	change({ format: 'doubles_women', value: 3.28 }),
	change({ value: 2.9 })
];

/** A fetcher over `changes`, five to a page, like the backend. */
function pages(changes: RatingChange[]): HistoryFetcher {
	return async (_code, offset) => ({
		items: changes.slice(offset, offset + 5),
		count: changes.length
	});
}

async function shown(fetch: HistoryFetcher, offset = 0) {
	const history = new RatingHistoryView(fetch);
	await history.load(CODE, offset);
	const onpage = vi.fn((next: number) => void history.load(CODE, next));
	const screen = await render(RatingHistory, { history, onpage });
	return { screen, history, onpage };
}

function failing(kind: AppErrorKind): HistoryFetcher {
	return async () => {
		throw new AppError({ kind, status: 500, code: kind, message: 'Failed.', fields: {} });
	};
}

/** An element's text with its white space collapsed, as a reader hears it. */
function textOf(element: Element): string {
	return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('RatingHistory', () => {
	it('lists each change with its format, value, reliability, day and a demonstration label', async () => {
		const { screen } = await shown(pages(CHANGES));
		const list = screen.getByTestId('rating-history');
		await expect.element(list).toBeVisible();
		expect(list.getByRole('listitem').elements()).toHaveLength(5);
		const first = textOf(list.getByRole('listitem').first().element());
		expect(first).toContain('Mixed doubles');
		expect(first).toContain('3.42');
		expect(first).toContain('Reliability: 65 out of 100');
		expect(first).toContain('After a match, 15 Nov 2026');
		expect(list.getByText('Demonstration', { exact: true }).elements()).toHaveLength(5);
		await expect
			.element(screen.getByText('Reliability from an external rating: 30 out of 100'))
			.toBeVisible();
		expect(screen.container.textContent).not.toMatch(/OPEN rating|replay|engine/i);
	});

	it('says in plain words what a recount and a removal mean', async () => {
		const { screen } = await shown(pages(CHANGES));
		await expect.element(screen.getByText('Recounted', { exact: true })).toBeVisible();
		await expect
			.element(screen.getByText(/All matches were counted again, for example/))
			.toBeVisible();
		await expect.element(screen.getByText('Removed', { exact: true })).toBeVisible();
		await expect.element(screen.getByText(/These are the numbers that were removed/)).toBeVisible();
		const removed = textOf(screen.getByRole('listitem').nth(2).element());
		expect(removed).toContain('2.95');
		expect(removed).toContain('Removed, 16 Nov 2026');
	});

	it('pages with Newer and Older', async () => {
		const { screen, onpage } = await shown(pages(CHANGES));
		const newer = screen.getByRole('button', { name: 'Newer' });
		const older = screen.getByRole('button', { name: 'Older' });
		await expect.element(screen.getByTestId('rating-history-range')).toHaveTextContent('1–5 of 7');
		await expect.element(newer).toBeDisabled();
		await older.click();
		expect(onpage).toHaveBeenLastCalledWith(5);
		await expect.element(screen.getByTestId('rating-history-range')).toHaveTextContent('6–7 of 7');
		expect(screen.getByRole('listitem').elements()).toHaveLength(2);
		await expect.element(older).toBeDisabled();
		await newer.click();
		expect(onpage).toHaveBeenLastCalledWith(0);
		await expect.element(screen.getByTestId('rating-history-range')).toHaveTextContent('1–5 of 7');
	});

	it('shows no page controls when everything fits on one page', async () => {
		const { screen } = await shown(pages(CHANGES.slice(0, 2)));
		await expect.element(screen.getByTestId('rating-history')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Older' })).not.toBeInTheDocument();
	});

	it('says so when nothing has changed the ratings yet', async () => {
		const { screen } = await shown(pages([]));
		await expect.element(screen.getByText(/Nothing has changed your ratings yet/)).toBeVisible();
	});

	it('reads plainly, not as an error, when the history is not there to show (404)', async () => {
		const { screen } = await shown(async () => null);
		await expect.element(screen.getByText('There is no rating history to show.')).toBeVisible();
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});

	it('offers to go back to the newest from a page past the end', async () => {
		const { screen, onpage } = await shown(
			async (): Promise<RatingHistoryPage> => ({ items: [], count: 3 }),
			10
		);
		await screen.getByRole('button', { name: 'Back to the newest' }).click();
		expect(onpage).toHaveBeenLastCalledWith(0);
	});

	it('offers Try again when the history fails to load', async () => {
		let calls = 0;
		const fetch: HistoryFetcher = async (code, offset) => {
			calls++;
			if (calls === 1) return failing('server')(code, offset);
			return pages(CHANGES)(code, offset);
		};
		const { screen } = await shown(fetch);
		await expect.element(screen.getByText("Your rating history didn't load.")).toBeVisible();
		await expect.element(screen.getByText(/Something went wrong on our side/)).toBeVisible();
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByTestId('rating-history')).toBeVisible();
		expect(calls).toBe(2);
	});

	it('says when the player is offline', async () => {
		const { screen } = await shown(failing('network'));
		await expect.element(screen.getByText("You're offline.")).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
	});
});
