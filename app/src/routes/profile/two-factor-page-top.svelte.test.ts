/**
 * Review finding V3 (frontend#261): the two-factor page's back link sat outside the `pt-4`
 * wrapper the match page uses, so its link and title sat 16px higher than there. On the match
 * page the link starts 24px down (16 of padding, then its own 8).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../layout.css';
import TwoFactorPage from './two-factor/+page.svelte';

describe('the two-factor page top', () => {
	it('starts the back link 24px down, as the match page does', async () => {
		const screen = await render(TwoFactorPage);
		const back = screen.getByRole('link', { name: 'Profile' });
		await expect.element(back).toBeVisible();
		const gap =
			back.element().getBoundingClientRect().top - screen.container.getBoundingClientRect().top;
		expect(gap).toBe(24);
	});
});
