import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ThemeToggle from './theme-toggle.svelte';

describe('ThemeToggle in a browser', () => {
	afterEach(() => {
		delete document.documentElement.dataset.theme;
		localStorage.clear();
	});

	it('is 44px square (size-11), as big as a touch target', async () => {
		const screen = await render(ThemeToggle);
		// The component tests load no CSS, so the e2e shell test measures the real size.
		await expect.element(screen.getByRole('button')).toHaveClass('size-11');
	});

	it('flips data-theme and its label when clicked', async () => {
		document.documentElement.dataset.theme = 'dark';
		const screen = await render(ThemeToggle);

		const toggle = screen.getByRole('button');
		await expect.element(toggle).toHaveAccessibleName('Switch to ivory theme');
		await toggle.click();

		await expect.element(toggle).toHaveAccessibleName('Switch to black theme');
		expect(document.documentElement.dataset.theme).toBe('light');
	});
});
