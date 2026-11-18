import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RatingsCard from './ratings-card.svelte';
import type { PlayerRatings } from './types.js';

const RATINGS: PlayerRatings = {
	singles: null,
	doubles: {
		value: 3.42,
		reliability: 0.65,
		provisional: true,
		updatedAt: '2026-11-17T09:00:00Z'
	},
	demonstration: true
};

describe('RatingsCard against the real backend', () => {
	it("says ratings aren't live yet and shows no number", async () => {
		const screen = await render(RatingsCard, { sample: false });
		await expect.element(screen.getByText("Ratings aren't live yet")).toBeVisible();
		await expect.element(screen.getByText('Sample data')).not.toBeInTheDocument();
		expect(screen.container.textContent).not.toMatch(/\d\.\d\d/);
	});

	it('ignores ratings it is handed, since the backend has none', async () => {
		const screen = await render(RatingsCard, { sample: false, ratings: RATINGS });
		await expect.element(screen.getByText("Ratings aren't live yet")).toBeVisible();
		expect(screen.container.textContent).not.toContain('3.42');
	});
});

describe('RatingsCard in a mock mode', () => {
	it('labels the numbers as sample data and says they are not the player rating', async () => {
		const screen = await render(RatingsCard, { sample: true, ratings: RATINGS });
		await expect.element(screen.getByText('Sample data')).toBeVisible();
		await expect.element(screen.getByText(/This is not your rating/)).toBeVisible();
		await expect.element(screen.getByText("Ratings aren't live yet")).not.toBeInTheDocument();
		expect(screen.container.textContent).toContain('3.42');
	});

	it('names a format with no rating instead of leaving it blank', async () => {
		const screen = await render(RatingsCard, { sample: true, ratings: RATINGS });
		await expect.element(screen.getByText('Not enough matches yet')).toBeVisible();
		await expect.element(screen.getByText(/early estimate/)).toBeVisible();
	});

	it('shows a loading line while the sample loads', async () => {
		const screen = await render(RatingsCard, { sample: true, loading: true });
		await expect.element(screen.getByText(/Loading/)).toBeVisible();
	});

	it('says plainly when there are no sample numbers', async () => {
		const screen = await render(RatingsCard, { sample: true, ratings: null });
		await expect.element(screen.getByText(/no sample numbers/)).toBeVisible();
	});

	it.each([true, false])(
		'never says "OPEN rating" and uses no em dash (sample: %s)',
		async (sample) => {
			const screen = await render(RatingsCard, { sample, ratings: RATINGS });
			const text = screen.container.textContent ?? '';
			expect(text).not.toMatch(/OPEN rating/i);
			expect(text).not.toContain('—');
		}
	);
});
