import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ThemeToggle from './theme-toggle.svelte';

describe('ThemeToggle in a browser', () => {
	afterEach(() => {
		delete document.documentElement.dataset.theme;
		localStorage.clear();
	});

	it('flips data-theme and its label when clicked', async () => {
		document.documentElement.dataset.theme = 'dark';
		const screen = await render(ThemeToggle);

		const toggle = screen.getByRole('button');
		await expect.element(toggle).toHaveAccessibleName('Switch to light theme');
		await toggle.click();

		await expect.element(toggle).toHaveAccessibleName('Switch to dark theme');
		expect(document.documentElement.dataset.theme).toBe('light');
	});
});
