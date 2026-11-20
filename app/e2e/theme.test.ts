import { expect, test } from '@playwright/test';

test('the theme choice persists across a reload', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	// With no stored choice the page follows the system setting and has no data-theme yet.
	const html = page.locator('html');

	await page.getByRole('button', { name: 'Switch to ivory theme' }).first().click();
	await expect(html).toHaveAttribute('data-theme', 'light');

	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'light');
	await expect(page.getByRole('button', { name: 'Switch to black theme' }).first()).toBeVisible();
});
