import { expect, test } from '@playwright/test';

const TABS = [
	{ name: 'Home', path: '/' },
	{ name: 'Record', path: '/record' },
	{ name: 'Matches', path: '/matches' },
	{ name: 'Profile', path: '/profile' }
];

test('the home page loads with the app title', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/OPEN Pickleball/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the tab bar navigates to each tab and aria-current follows', async ({ page }) => {
	await page.goto('/');
	const tabBar = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });

	for (const { name, path } of TABS) {
		await tabBar.getByRole('link', { name, exact: true }).click();
		await expect(page).toHaveURL(path);
		await expect(tabBar.locator('[aria-current="page"]')).toHaveCount(1);
		await expect(tabBar.getByRole('link', { name, exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
});
