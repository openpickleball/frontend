import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import RatingsCard from './ratings-card.svelte';
import { RATING_TERMS } from './ratings.js';
import type { PlayerRatings, Rating } from './types.js';

function rating(more: Partial<Rating>): Rating {
	return {
		format: 'singles',
		value: 3.05,
		reliability: 72,
		importedReliability: null,
		established: true,
		provisional: false,
		demonstration: true,
		updatedAt: '2026-11-15T09:00:00Z',
		...more
	};
}

const RATINGS: PlayerRatings = {
	demonstration: true,
	ratings: [
		rating({ format: 'mixed_doubles', value: 3.42, reliability: 40.4, provisional: true }),
		rating({
			format: 'doubles_women',
			value: 3.31,
			reliability: 65,
			established: false,
			importedReliability: 30
		})
	]
};

describe('RatingsCard', () => {
	it('shows every format in a tile of the same size', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		const tiles = screen.getByTestId('ratings').getByRole('listitem');
		expect(tiles.elements()).toHaveLength(2);
		// No tile is singled out: each has the same classes, name, number and reliability.
		const [first, second] = tiles.elements();
		expect(first.className).toBe(second.className);
		expect(first.textContent).toContain('Mixed doubles');
		expect(first.textContent).toContain('3.42');
		expect(second.textContent).toContain("Women's doubles");
		expect(second.textContent).toContain('3.31');
		expect(second.textContent).toContain('Reliability: 65 out of 100');
	});

	it('links to the rating history page', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		await expect
			.element(screen.getByRole('link', { name: 'Rating history' }))
			.toHaveAttribute('href', '/profile/ratings');
	});

	it('shows every rating with its reliability and a demonstration label', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		await expect.element(screen.getByText('Mixed doubles')).toBeVisible();
		await expect.element(screen.getByText('3.42')).toBeVisible();
		await expect.element(screen.getByText('Reliability: 40 out of 100')).toBeVisible();
		expect(screen.getByText('Demonstration', { exact: true }).elements()).toHaveLength(2);
		await expect
			.element(
				screen.getByText('These are demonstration numbers while the rating method is being built.')
			)
			.toBeVisible();
	});

	it('names an early estimate, a rating that can still change and imported reliability', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		await expect.element(screen.getByText('Early estimate.')).toBeVisible();
		await expect.element(screen.getByText('May still change.')).toBeVisible();
		await expect
			.element(screen.getByText('Reliability from an external rating: 30 out of 100'))
			.toBeVisible();
	});

	it('explains reliability and the tile lines in one popover for the section', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		const buttons = screen.getByRole('button', { name: 'What does reliability mean?' });
		expect(buttons.elements()).toHaveLength(1);
		await buttons.click();
		const popover = page.getByRole('dialog', { name: 'What does reliability mean?' });
		for (const item of Object.values(RATING_TERMS)) {
			await expect.element(popover.getByText(item.text)).toBeVisible();
		}
	});

	it('explains only the lines the tiles show', async () => {
		const screen = await render(RatingsCard, {
			ratings: { demonstration: true, ratings: [rating({})] }
		});
		await screen.getByRole('button', { name: 'What does reliability mean?' }).click();
		const popover = page.getByRole('dialog', { name: 'What does reliability mean?' });
		await expect.element(popover.getByText(RATING_TERMS.reliability.text)).toBeVisible();
		for (const item of [RATING_TERMS.imported, RATING_TERMS.early, RATING_TERMS.provisional]) {
			await expect.element(popover.getByText(item.text)).not.toBeInTheDocument();
		}
	});

	it('has no info button without ratings', async () => {
		const screen = await render(RatingsCard, { ratings: { demonstration: true, ratings: [] } });
		await expect.element(screen.getByText(/You don't have a rating yet/)).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'What does reliability mean?' }))
			.not.toBeInTheDocument();
	});

	it('says so when the player has no rating yet', async () => {
		const screen = await render(RatingsCard, { ratings: { demonstration: true, ratings: [] } });
		await expect.element(screen.getByText(/You don't have a rating yet/)).toBeVisible();
		await expect.element(screen.getByText(/demonstration numbers/)).not.toBeInTheDocument();
	});

	it('says plainly when the backend has no ratings to show (404)', async () => {
		const screen = await render(RatingsCard, { ratings: null });
		await expect.element(screen.getByText('There are no ratings to show.')).toBeVisible();
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows a loading line, then a failure line', async () => {
		const loading = await render(RatingsCard, { loading: true });
		await expect.element(loading.getByText(/Loading your ratings/)).toBeVisible();
		loading.unmount();
		const failed = await render(RatingsCard, { failed: true });
		await expect.element(failed.getByText(/We can't load your ratings right now/)).toBeVisible();
	});

	it.each([
		['ratings', RATINGS],
		['none', null]
	])('never says "OPEN rating", names no scale and uses no em dash (%s)', async (_, ratings) => {
		const screen = await render(RatingsCard, { ratings });
		const text = screen.container.textContent ?? '';
		expect(text).not.toMatch(/OPEN rating/i);
		expect(text).not.toMatch(/2\.0|8\.0/);
		expect(text).not.toContain('—');
	});
});
