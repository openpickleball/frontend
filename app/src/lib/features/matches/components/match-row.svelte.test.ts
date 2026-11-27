import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { matchCache } from '../cache.svelte.js';
import { rowLabel } from '../format.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import MatchRow from './match-row.svelte';

beforeEach(() => {
	matchCache.reset();
	matchCache.setOwnerSource(() => TAMSIN);
});
afterEach(() => matchCache.reset());

describe('MatchRow', () => {
	it('shows a hidden chevron that marks the row as a link', async () => {
		const match = viewerMatch({ b: true });
		await render(MatchRow, { match, you: TAMSIN });

		const row = page.getByTestId('match-row').element();
		const icons = row.querySelectorAll('svg');
		expect(icons).toHaveLength(1);
		expect(icons[0].getAttribute('aria-hidden')).toBe('true');
	});

	it('keeps the sentence as the link name', async () => {
		const match = viewerMatch({ b: true });
		await render(MatchRow, { match, you: TAMSIN });

		await expect
			.element(
				page.getByRole('link', { name: new RegExp(`^${RegExp.escape(rowLabel(match, TAMSIN))}`) })
			)
			.toBeVisible();
	});

	it('shows On hold in place of Confirmed for a held confirmed match', async () => {
		const match = viewerMatch({}, { status: 'confirmed' });
		matchCache.rememberHolds([{ match, vouched: false }]);
		await render(MatchRow, { match, you: TAMSIN });

		const row = page.getByTestId('match-row');
		await expect.element(row.getByText('On hold', { exact: true })).toBeVisible();
		// Neither the badge nor the spoken sentence says Confirmed.
		expect(row.element().textContent).not.toContain('Confirmed');
	});

	it('shows only Confirmed for a confirmed match that is not held', async () => {
		const match = viewerMatch({}, { status: 'confirmed' });
		await render(MatchRow, { match, you: TAMSIN });

		const row = page.getByTestId('match-row');
		await expect.element(row.getByText('Confirmed', { exact: true })).toBeVisible();
		expect(row.element().textContent).not.toContain('On hold');
	});

	it('keeps Disputed on a held disputed match', async () => {
		const match = viewerMatch({}, { status: 'disputed' });
		matchCache.rememberHolds([{ match, vouched: false }]);
		await render(MatchRow, { match, you: TAMSIN });

		await expect.element(page.getByText('Disputed', { exact: true })).toBeVisible();
	});
});

describe('MatchRow note under a list title', () => {
	it('leaves out Needs your confirmation in a list that says it', async () => {
		const match = viewerMatch({ b: true });
		await render(MatchRow, { match, you: TAMSIN, listOf: 'needs-you' });
		await expect.element(page.getByTestId('match-row')).toBeVisible();
		await expect.element(page.getByText('Needs your confirmation.')).not.toBeInTheDocument();
	});

	it('says Needs your confirmation in any other list', async () => {
		await render(MatchRow, { match: viewerMatch({ b: true }), you: TAMSIN });
		await expect.element(page.getByText('Needs your confirmation.')).toBeVisible();
	});

	it('keeps who confirmed in the waiting list, without Waiting for the other team', async () => {
		const match = viewerMatch({ a: true, decision: 'confirm' });
		await render(MatchRow, { match, you: TAMSIN, listOf: 'waiting' });
		await expect
			.element(page.getByText('You confirmed this score.', { exact: true }))
			.toBeVisible();
	});

	it('says only that the team vouched in the on-hold list', async () => {
		const match = viewerMatch({}, { status: 'confirmed' });
		matchCache.rememberHolds([{ match, vouched: true }]);
		await render(MatchRow, { match, you: TAMSIN, listOf: 'on-hold' });
		await expect
			.element(page.getByText('Your team has vouched for it.', { exact: true }))
			.toBeVisible();
	});

	it('has no note for an unvouched match in the on-hold list', async () => {
		const match = viewerMatch({}, { status: 'confirmed' });
		matchCache.rememberHolds([{ match, vouched: false }]);
		await render(MatchRow, { match, you: TAMSIN, listOf: 'on-hold' });
		await expect.element(page.getByTestId('match-row')).toBeVisible();
		expect(page.getByTestId('match-row').element().querySelector('p')).toBeNull();
	});

	it('keeps You disputed this score in the disputed list', async () => {
		const match = viewerMatch({ decision: 'dispute' }, { status: 'disputed' });
		await render(MatchRow, { match, you: TAMSIN, listOf: 'disputed' });
		await expect.element(page.getByText('You disputed this score.')).toBeVisible();
	});
});
