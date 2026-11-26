import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RatingsCard from './ratings-card.svelte';
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
	it('shows the most reliable rating first, with its reliability', async () => {
		const screen = await render(RatingsCard, { ratings: RATINGS });
		const headline = screen.getByTestId('headline-rating');
		await expect.element(headline).toBeVisible();
		const text = headline.element().textContent ?? '';
		expect(text).toContain("Women's doubles");
		expect(text).toContain('3.31');
		expect(text).toContain('Reliability: 65 out of 100');
		expect(text).not.toContain('3.42');
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
		await expect.element(screen.getByText(/Early estimate/)).toBeVisible();
		await expect
			.element(screen.getByText(/may change when ratings are next recounted/))
			.toBeVisible();
		await expect
			.element(screen.getByText('Reliability from an external rating: 30 out of 100'))
			.toBeVisible();
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
