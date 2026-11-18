import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	MOCK_KEYS,
	MOCK_PASSWORD,
	PLAYERS,
	UNVERIFIED_EMAIL,
	VERIFIED_EMAIL
} from '../src/lib/mocks/fixtures';

// Runs under PUBLIC_API_MOCK=all (playwright.config.ts). The sign-in screens belong to the auth
// task, so these tests sign in through the mock API from inside the page, the way the app's own
// calls reach it. The service worker answers those fetches, not Playwright's request context.

const tamsin = PLAYERS.find((p) => p.key === 'tamsin')!;
const rosa = PLAYERS.find((p) => p.key === 'rosa')!;

async function signIn(page: Page, email: string, verifyKey?: string) {
	await page.goto('/');
	// The mock worker is ready once it controls the page.
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
	const status = await page.evaluate(
		async ({ email, password, verifyKey }) => {
			const base = '/_allauth/browser/v1';
			const token = () =>
				document.cookie
					.split('; ')
					.find((c) => c.startsWith('csrftoken='))
					?.split('=')[1] ?? '';
			const post = (path: string, body: unknown) =>
				fetch(`${base}/auth/${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token() },
					body: JSON.stringify(body)
				});
			await fetch(`${base}/config`);
			if (verifyKey) await post('email/verify', { key: verifyKey });
			return (await post('login', { email, password })).status;
		},
		{ email, password: MOCK_PASSWORD, verifyKey }
	);
	expect(status).toBe(200);
}

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

test.describe('an account that has a player (me/player exists)', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page, VERIFIED_EMAIL);
		await page.goto('/profile');
	});

	test('shows the code, the match count and the labelled sample rating, with no prompt', async ({
		page
	}) => {
		await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
		await expect(page.getByTestId('match-count')).toHaveText(/^\d+$/);

		// Mock mode: a sample card that says it is sample data.
		await expect(page.getByText('Sample data', { exact: true })).toBeVisible();
		await expect(page.getByText(/This is not your rating/)).toBeVisible();
		await expect(page.getByText("Ratings aren't live yet")).toHaveCount(0);

		// The code came from the server, so there is nothing to enter or change.
		await expect(page.getByRole('heading', { name: 'Enter your OPEN code' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Change code' })).toHaveCount(0);
	});

	test('copies the code', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy code' }).click();
		await expect(page.getByText('Code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tamsin.code);
	});

	test('shares with the share sheet when the browser has one', async ({ page }) => {
		await page.evaluate(() => {
			(window as unknown as { shared: unknown[] }).shared = [];
			Object.defineProperty(navigator, 'share', {
				configurable: true,
				value: async (data: unknown) => {
					(window as unknown as { shared: unknown[] }).shared.push(data);
				}
			});
		});
		await page.getByRole('button', { name: 'Share' }).click();
		const shared = await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);
		expect(JSON.stringify(shared)).toContain(tamsin.code);
	});

	test('shares by copying when there is no share sheet', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
		);
		await page.getByRole('button', { name: 'Share' }).click();
		await expect(page.getByText('Code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tamsin.code);
	});

	for (const scheme of ['dark', 'light'] as const) {
		test(`has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await expect(page.getByTestId('my-code')).toBeVisible();
			await expect(page.getByTestId('match-count')).toHaveText(/^\d+$/);
			await expect(page.getByText('Sample data', { exact: true })).toBeVisible();
			await expectNoAxeViolations(page);
		});
	}
});

test.describe('an account with no player yet (me/player answers 404)', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page, UNVERIFIED_EMAIL, MOCK_KEYS.verifyEmail);
		await page.goto('/profile');
	});

	test('asks for the code once, fixes its format, and remembers it', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Enter your OPEN code' })).toBeVisible();
		await expect(page.getByTestId('my-code')).toHaveCount(0);

		const field = page.getByRole('textbox', { name: 'Your OPEN code' });
		await field.fill(rosa.code.toLowerCase().replaceAll('-', ''));
		await expect(page.getByText(`We will save it as`)).toContainText(rosa.code);

		await field.fill('P-AAAA-AAAA');
		await expect(page.getByRole('alert')).toContainText('does not look right');
		await expectNoAxeViolations(page);

		await field.fill(rosa.code.toLowerCase().replaceAll('-', ''));
		await page.getByRole('button', { name: 'Save code' }).click();
		await expect(page.getByTestId('my-code')).toHaveText(rosa.code);
		await expect(page.getByText("Ratings aren't live yet")).toHaveCount(0);

		// A fresh visit finds it on the device and does not ask again.
		await page.reload();
		await expect(page.getByTestId('my-code')).toHaveText(rosa.code);
		await expect(page.getByRole('heading', { name: 'Enter your OPEN code' })).toHaveCount(0);
	});

	test('changes a code that was entered on this device', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Your OPEN code' }).fill(rosa.code);
		await page.getByRole('button', { name: 'Save code' }).click();
		await expect(page.getByTestId('my-code')).toHaveText(rosa.code);

		await page.getByRole('button', { name: 'Change code' }).click();
		await expect(page.getByRole('heading', { name: 'Change your OPEN code' })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('my-code')).toHaveText(rosa.code);

		await page.getByRole('button', { name: 'Change code' }).click();
		await page.getByRole('textbox', { name: 'Your OPEN code' }).fill(tamsin.code);
		await page.getByRole('button', { name: 'Save code' }).click();
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
	});
});

test('signed out, the profile asks the player to sign in', async ({ page }) => {
	await page.goto('/profile');
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	await expect(page.getByTestId('my-code')).toHaveCount(0);
});
