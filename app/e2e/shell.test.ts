import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

const TABS = [
	{ name: 'Home', path: '/' },
	{ name: 'Record', path: '/record' },
	{ name: 'Matches', path: '/matches' },
	{ name: 'Ratings', path: '/ratings' },
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
		// Home's name ends with how many matches need the player, such as "Home, 3 need you".
		const link = tabBar.getByRole('link', {
			name: name === 'Home' ? /^Home(, \d+ needs? you)?$/ : name,
			exact: true
		});
		await link.click();
		await expect(page).toHaveURL(path);
		await expect(tabBar.locator('[aria-current="page"]')).toHaveCount(1);
		await expect(link).toHaveAttribute('aria-current', 'page');
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
	await expect(page.getByRole('heading', { level: 2, name: 'Needs you' })).toBeVisible();
});

for (const width of [320, 375]) {
	test(`the five tabs fit a ${width}px phone: one line each, 44px targets, the badge inside`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 740 });
		await signInAsPlayer(page);
		const tabBar = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
		await expect(tabBar.getByTestId('needs-you-badge')).toBeVisible();
		const links = tabBar.getByRole('link');
		await expect(links).toHaveCount(5);
		const tabs = await links.evaluateAll((items) =>
			items.map((link) => {
				const box = link.getBoundingClientRect();
				// The label is the link's text, or its aria-hidden span when the name says more.
				const label = [...link.childNodes].find(
					(node) =>
						(node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
						(node instanceof HTMLElement && node.matches('span[aria-hidden="true"]'))
				);
				const range = document.createRange();
				if (label) range.selectNodeContents(label);
				return {
					width: box.width,
					height: box.height,
					// One client rect per line the label takes.
					lines: range.getClientRects().length,
					overflow: link.scrollWidth > link.clientWidth
				};
			})
		);
		for (const tab of tabs) {
			expect(tab.width).toBeGreaterThanOrEqual(44);
			expect(tab.height).toBeGreaterThanOrEqual(44);
			expect(tab.lines).toBe(1);
			expect(tab.overflow).toBe(false);
		}
		// The badge stays inside the Home tab.
		const inside = await tabBar.evaluate((nav) => {
			const badge = nav.querySelector('[data-testid="needs-you-badge"]')!.getBoundingClientRect();
			const home = nav.querySelector('a')!.getBoundingClientRect();
			return (
				badge.left >= home.left &&
				badge.right <= home.right &&
				badge.top >= home.top &&
				badge.bottom <= home.bottom
			);
		});
		expect(inside).toBe(true);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	});
}

test('the top bar has the wordmark and a 44px theme toggle, and no Sign out', async ({ page }) => {
	await signInAsPlayer(page);
	const bar = page.getByRole('banner');
	const toggle = bar.getByRole('button', { name: /^Switch to/ });
	await expect(toggle).toBeVisible();
	await expect(bar.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
	const box = await toggle.boundingBox();
	expect(box?.width).toBeGreaterThanOrEqual(44);
	expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('from 1024px the side bar is the banner, with the theme toggle and the one Sign out', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await signInAsPlayer(page);
	await page.goto('/profile');
	const bar = page.getByRole('banner');
	await expect(bar).toHaveCount(1);
	expect((await bar.boundingBox())?.width).toBe(256);
	const nav = bar.getByRole('navigation', { name: 'Main' });
	await expect(nav).toBeVisible();
	await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
	await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
	const toggle = bar.getByRole('button', { name: /^Switch to/ });
	await expect(toggle).toBeVisible();
	expect((await toggle.boundingBox())?.width).toBeGreaterThanOrEqual(44);
	await expect(bar.getByRole('button', { name: 'Sign out' })).toBeVisible();
	// Profile's Sign out is for phones, so there is one Sign out on screen.
	await expect(
		page.getByRole('button', { name: 'Sign out' }).filter({ visible: true })
	).toHaveCount(1);
});
