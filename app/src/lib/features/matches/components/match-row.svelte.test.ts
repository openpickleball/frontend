import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { Match } from '#lib/domain/index.js';
import { matchCache } from '../cache.svelte.js';
import { rowLabel } from '../format.js';
import {
	BEA,
	TAMSIN,
	bea,
	privatePlayer,
	sampleMatch,
	tamsin,
	team,
	viewerMatch
} from '../testing.js';
import MatchRow from './match-row.svelte';

beforeEach(() => {
	matchCache.reset();
	matchCache.setOwnerSource(() => TAMSIN);
});
afterEach(() => matchCache.reset());

/** The row's tags, as drawn, with the tone of each. */
function tags(): string[] {
	const badges = page.getByTestId('match-tags').element().querySelectorAll('[data-slot="badge"]');
	return [...badges].map(
		(badge) => `${badge.textContent?.trim()}:${badge.getAttribute('data-tone')}`
	);
}

async function renderRow(match: Match, hold?: { vouched: boolean }) {
	if (hold) matchCache.rememberHolds([{ match, ...hold }]);
	await render(MatchRow, { match, you: TAMSIN });
	await expect.element(page.getByTestId('match-row')).toBeVisible();
}

describe('MatchRow', () => {
	it('is one link to the match page, named by the sentence, with a hidden chevron', async () => {
		const match = viewerMatch({ b: true });
		await renderRow(match);

		const link = page.getByRole('link', { name: rowLabel(match, TAMSIN), exact: true });
		await expect.element(link).toHaveAttribute('href', `/matches/${match.code}`);
		const icons = link.element().querySelectorAll('svg');
		expect(icons).toHaveLength(1);
		expect(icons[0].getAttribute('aria-hidden')).toBe('true');
		expect(icons[0].getAttribute('data-testid')).toBe('row-chevron');
	});

	it('shows the format and date, then the score with Won or Lost from her side', async () => {
		await renderRow(viewerMatch({ b: true }));
		const row = page.getByTestId('match-row');
		await expect.element(row.getByText('Doubles · Sat 14 Nov', { exact: true })).toBeVisible();
		await expect.element(row.getByTestId('row-score')).toHaveTextContent('11-7, 9-11, 11-4');
		await expect.element(row.getByTestId('row-result')).toHaveTextContent('Won');
	});

	it('reads the score and Lost from her side when she is on team B', async () => {
		await render(MatchRow, { match: sampleMatch({ viewerSide: 'b' }), you: BEA });
		await expect.element(page.getByTestId('row-score')).toHaveTextContent('7-11, 11-9, 4-11');
		await expect.element(page.getByTestId('row-result')).toHaveTextContent('Lost');
	});

	it('names the partner and the opponents in doubles', async () => {
		await renderRow(viewerMatch({ b: true }));
		await expect
			.element(page.getByTestId('row-players'))
			.toHaveTextContent('With Oren Quill vs Bea Marlowe & Kit Ashdown');
	});

	it('names the opponent in singles', async () => {
		await renderRow(
			viewerMatch(
				{ b: true },
				{ format: 'singles', teamA: team('a', tamsin), teamB: team('b', bea) }
			)
		);
		await expect.element(page.getByTestId('row-players')).toHaveTextContent('Vs Bea Marlowe');
		await expect.element(page.getByText('Singles · Sat 14 Nov', { exact: true })).toBeVisible();
	});

	it('says "Private player" for a private player', async () => {
		await renderRow(viewerMatch({ b: true }, { teamB: team('b', privatePlayer) }));
		await expect
			.element(page.getByTestId('row-players'))
			.toHaveTextContent('With Oren Quill vs Private player');
	});
});

describe('MatchRow for someone who did not play', () => {
	it('names both teams, shows no Won or Lost and asks for nothing', async () => {
		await renderRow(sampleMatch());
		await expect
			.element(page.getByTestId('row-players'))
			.toHaveTextContent('Tamsin Vale & Oren Quill vs Bea Marlowe & Kit Ashdown');
		await expect.element(page.getByTestId('row-result')).not.toBeInTheDocument();
		expect(tags()).toEqual(['Pending:pending']);
	});
});

describe('MatchRow tags', () => {
	it('asks for a confirmation in place of Pending', async () => {
		const match = viewerMatch({ b: true });
		await renderRow(match);
		expect(tags()).toEqual(['Needs your confirmation:action']);
		// The spoken sentence ends with the same tag.
		expect(rowLabel(match, TAMSIN)).toMatch(/ Needs your confirmation\.$/);
	});

	it('shows Pending when her team has confirmed', async () => {
		await renderRow(viewerMatch({ a: true, decision: 'confirm' }));
		expect(tags()).toEqual(['Pending:pending']);
	});

	it('asks for both when a match to confirm is held and not vouched for', async () => {
		const match = viewerMatch({ b: true });
		await renderRow(match, { vouched: false });
		expect(tags()).toEqual(['Needs your confirmation:action', 'Needs your vouch:action']);
		await expect
			.element(page.getByRole('link', { name: rowLabel(match, TAMSIN, { vouched: false }) }))
			.toBeVisible();
	});

	it('keeps Confirmed on a held match and adds Needs your vouch', async () => {
		await renderRow(viewerMatch({}, { status: 'confirmed' }), { vouched: false });
		expect(tags()).toEqual(['Confirmed:confirmed', 'Needs your vouch:action']);
	});

	it('shows On hold once her team has vouched', async () => {
		await renderRow(viewerMatch({}, { status: 'confirmed' }), { vouched: true });
		expect(tags()).toEqual(['Confirmed:confirmed', 'On hold:held']);
	});

	it('keeps Disputed on a held disputed match', async () => {
		await renderRow(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }), {
			vouched: false
		});
		expect(tags()).toEqual(['Disputed:disputed', 'Needs your vouch:action']);
	});

	it('shows only Confirmed for a confirmed match that is not held', async () => {
		await renderRow(viewerMatch({}, { status: 'confirmed' }));
		expect(tags()).toEqual(['Confirmed:confirmed']);
	});

	it('shows Voided, with no hold, on a voided match', async () => {
		await renderRow(viewerMatch({}, { status: 'voided' }), { vouched: false });
		expect(tags()).toEqual(['Voided:voided']);
	});

	it('draws the action tags in the warning color and the statuses in their own', async () => {
		await renderRow(viewerMatch({ b: true }), { vouched: false });
		const badges = page.getByTestId('match-tags').element().querySelectorAll('[data-slot="badge"]');
		expect(badges).toHaveLength(2);
		for (const badge of badges) expect(badge.className).toContain('text-warning');
	});

	it('draws a status tag in its status color, not the warning color', async () => {
		await renderRow(viewerMatch({}, { status: 'confirmed' }));
		const badge = page.getByTestId('match-tags').element().querySelector('[data-slot="badge"]');
		expect(badge?.className).toContain('text-confirmed');
		expect(badge?.className).not.toContain('text-warning');
	});
});
