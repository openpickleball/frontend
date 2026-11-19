import { expect, test, type Page } from '@playwright/test';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

const TABS = [
	{ name: 'Home', path: '/' },
	{ name: 'Record', path: '/record' },
	{ name: 'Matches', path: '/matches' },
	{ name: 'Profile', path: '/profile' }
];

// The signed-in pages send a signed-out visitor to sign in, so sign in to the mock backend first.
function signInAsPlayer(page: Page) {
	return signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
}

test('the home page loads with the app title', async ({ page }) => {
	await signInAsPlayer(page);
	await expect(page).toHaveTitle(/OPEN Pickleball/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the tab bar navigates to each tab and aria-current follows', async ({ page }) => {
	await signInAsPlayer(page);
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

test('the account pages have no tab bar', async ({ page }) => {
	await page.goto('/account/login');
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
});

test('an unknown route shows a not-found page with a way home', async ({ page }) => {
	await signInAsPlayer(page);
	await page.goto('/does-not-exist');
	await expect(
		page.getByRole('heading', { level: 1, name: "We couldn't find this page" })
	).toBeVisible();
	await expect(page).toHaveTitle(/^We couldn't find this page/);
	await page.locator('#main').getByRole('link', { name: 'Back to home' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('link', { name: 'Record a match' })).toBeVisible();
});
