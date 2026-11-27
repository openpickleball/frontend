import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
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

	test('shows the code, the match count and the demonstration ratings', async ({ page }) => {
		await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
		await expect(page.getByTestId('match-count')).toHaveText(/^\d+$/);

		// Each rating the API sends, in a tile of its own, with its reliability and a
		// Demonstration label.
		const ratings = page.getByRole('region', { name: 'Ratings' });
		const tiles = ratings.getByTestId('ratings').getByRole('listitem');
		await expect(tiles).toHaveCount(2);
		await expect(tiles.first()).toContainText('Mixed doubles');
		await expect(tiles.first()).toContainText('3.42');
		// Rating history has its own page now.
		await expect(page.getByRole('region', { name: 'Rating history' })).toHaveCount(0);
		await expect(ratings.getByText('Reliability: 65 out of 100')).toBeVisible();
		await expect(ratings.getByText('Reliability: 40 out of 100')).toBeVisible();
		await expect(ratings.getByText('Demonstration', { exact: true })).toHaveCount(2);
		await expect(ratings.getByText(/demonstration numbers while the rating method/)).toBeVisible();
		await expect(ratings).not.toContainText(/OPEN rating/i);

		// An adult's current ratings are always shown, so there is no switch for them.
		await expect(page.getByTestId('privacy-rating-fixed')).toBeVisible();
		await expect(page.getByRole('switch', { name: 'Current ratings' })).toHaveCount(0);
	});

	test('reads me/player once for the code and once for the settings', async ({ page }) => {
		// `goto` in beforeEach returns at the load event, often before that page sends its own
		// reads. Wait until it shows the code and the settings, so both of its reads are done
		// and none of them is counted below.
		await expect(page.getByRole('switch', { name: 'Match history' })).toBeVisible();
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);

		const reads: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/v1/me/player') {
				reads.push(request.url());
			}
		});
		await page.reload();
		await expect(page.getByRole('switch', { name: 'Match history' })).toBeVisible();
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
		expect(reads).toHaveLength(2);
	});

	test('copies the code', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy code' }).click();
		await expect(page.getByText('Code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tamsin.code);
	});

	test('shares with the share sheet when the browser has one', async ({ page }) => {
		await page.addInitScript(() => {
			(window as unknown as { shared: unknown[] }).shared = [];
			Object.defineProperty(navigator, 'share', {
				configurable: true,
				value: async (data: unknown) => {
					(window as unknown as { shared: unknown[] }).shared.push(data);
				}
			});
		});
		await page.reload();
		await page.getByRole('button', { name: 'Share' }).click();
		const shared = await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);
		expect(JSON.stringify(shared)).toContain(tamsin.code);
	});

	test('hides Share when there is no share sheet', async ({ page }) => {
		await page.addInitScript(() =>
			Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
		);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Copy code' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
	});

	test('changes the display name, and keeps it after a reload', async ({ page }) => {
		const field = page.getByRole('textbox', { name: 'Display name' });
		await expect(field).toHaveValue(tamsin.displayName);

		await field.fill('   ');
		await page.getByRole('button', { name: 'Save name' }).click();
		await expect(page.getByText('Enter a display name.')).toBeVisible();

		await field.fill('  Tamsin Q  ');
		await page.getByRole('button', { name: 'Save name' }).click();
		await expect(page.getByText('Name saved.')).toBeVisible();
		await expect(field).toHaveValue('Tamsin Q');
		// The name under the page title follows.
		await expect(page.getByText('Tamsin Q', { exact: true })).toBeVisible();

		await page.reload();
		await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue('Tamsin Q');
	});

	test('changes who can see a detail, and keeps it after a reload', async ({ page }) => {
		const matches = page.getByRole('switch', { name: 'Match history' });
		await expect(matches).toBeChecked();
		await expect(page.getByRole('switch')).toHaveCount(5);

		await matches.click();
		await expect(matches).not.toBeChecked();
		await expect(page.locator('#privacy-match_history-state')).toHaveText('Only me');

		await page.reload();
		await expect(page.getByRole('switch', { name: 'Match history' })).not.toBeChecked();
		await expect(page.getByRole('switch', { name: 'Stats' })).toBeChecked();

		// The keyboard works too.
		await page.getByRole('switch', { name: 'Match history' }).focus();
		await page.keyboard.press('Space');
		await expect(page.getByRole('switch', { name: 'Match history' })).toBeChecked();
	});

	test('says how to get a copy of your data', async ({ page }) => {
		await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'info@openpb.org' })).toHaveAttribute(
			'href',
			'mailto:info@openpb.org'
		);
	});

	for (const scheme of ['dark', 'light'] as const) {
		test(`has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await expect(page.getByRole('switch', { name: 'Match history' })).toBeVisible();
			await expect(page.getByTestId('my-code')).toBeVisible();
			await expect(page.getByTestId('match-count')).toHaveText(/^\d+$/);
			await expect(page.getByTestId('ratings')).toBeVisible();
			await expectNoAxeViolations(page);
		});

		test(`the rating history page has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/profile/ratings');
			await expect(page.getByTestId('rating-history')).toBeVisible();
			await expectNoAxeViolations(page);
		});
	}

	test('shows the rating history on its own page, five changes at a time', async ({ page }) => {
		await page.getByRole('link', { name: 'Rating history' }).click();
		await expect(page).toHaveURL(/\/profile\/ratings$/);
		await expect(page).toHaveTitle('Rating history · OPEN Pickleball');
		await expect(page.getByRole('heading', { level: 1, name: 'Rating history' })).toBeVisible();
		const history = page.getByRole('main');
		const list = history.getByTestId('rating-history');
		await expect(list.getByRole('listitem')).toHaveCount(5);
		const first = list.getByRole('listitem').first();
		await expect(first).toContainText('Mixed doubles');
		await expect(first).toContainText('3.42');
		await expect(first).toContainText('Reliability: 65 out of 100');
		await expect(first).toContainText('After a match');
		await expect(first).toContainText('Demonstration');
		// A recount, and a rating a recount took away, each in plain words.
		await expect(list.getByText('Recounted', { exact: true }).first()).toBeVisible();
		await expect(list.getByText('Removed', { exact: true })).toBeVisible();
		await expect(list.getByText(/These are the numbers that were removed/)).toBeVisible();
		await expect(history).not.toContainText(/OPEN rating|replay|engine/i);

		await expect(history.getByTestId('rating-history-range')).toHaveText('1–5 of 8');
		await expect(history.getByRole('button', { name: 'Newer' })).toBeDisabled();
		await history.getByRole('button', { name: 'Older' }).click();
		await expect(history.getByTestId('rating-history-range')).toHaveText('6–8 of 8');
		await expect(list.getByRole('listitem')).toHaveCount(3);
		await expect(history.getByRole('button', { name: 'Older' })).toBeDisabled();
		await history.getByRole('button', { name: 'Newer' }).click();
		await expect(history.getByTestId('rating-history-range')).toHaveText('1–5 of 8');

		// The back link returns to the profile.
		await history.getByRole('link', { name: 'Profile', exact: true }).click();
		await expect(page).toHaveURL(/\/profile$/);
	});
});

test('a player with no rating history yet reads so', async ({ page }) => {
	await signIn(page, 'kit@example.com');
	await page.goto('/profile/ratings');
	await expect(page.getByText(/Nothing has changed your ratings yet/)).toBeVisible();
});

test.describe('an account with no player and no signup details held', () => {
	test.beforeEach(async ({ page }) => {
		// The fixture signed up before this session, so nothing is held: the app must ask.
		await signIn(page, UNVERIFIED_EMAIL, MOCK_KEYS.verifyEmail);
		await page.goto('/profile');
	});

	test('asks for the details, names each missing one, then shows the code', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Finish your player profile' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Name and privacy' })).toHaveCount(0);
		await expect(page.getByText(/can't change your display name/)).toHaveCount(0);

		await page.getByRole('button', { name: 'Save and show my code' }).click();
		await expect(page.getByText('Enter your birth month.')).toBeVisible();
		await expect(page.getByText('Enter your birth year.')).toBeVisible();
		await expect(page.getByText('Choose a gender division.')).toBeVisible();
		await expect(page.getByText('Enter a display name.')).toBeVisible();
		await expectNoAxeViolations(page);

		await page.getByLabel('Month').selectOption('6');
		await page.getByLabel('Year').fill('1990');
		await page.getByRole('radio', { name: 'Woman' }).click();
		await page.getByLabel('Display name').fill('Wren Mock');
		await page.getByRole('button', { name: 'Save and show my code' }).click();

		await expect(page.getByTestId('my-code')).toHaveText(/^P-/);
		await expect(page.getByRole('heading', { name: 'Finish your player profile' })).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue('Wren Mock');
		await page.reload();
		await expect(page.getByTestId('my-code')).toHaveText(/^P-/);
	});

	for (const scheme of ['dark', 'light'] as const) {
		test(`the details form has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await expect(page.getByRole('heading', { name: 'Finish your player profile' })).toBeVisible();
			await expectNoAxeViolations(page);
		});
	}

	test('a player aged 13 to 17 keeps current ratings private until 18', async ({ page }) => {
		await page.getByLabel('Month').selectOption('1');
		await page.getByLabel('Year').fill(String(new Date().getFullYear() - 15));
		await page.getByRole('radio', { name: 'Woman' }).click();
		await page.getByLabel('Display name').fill('Wren Mock');
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		await expect(page.getByTestId('my-code')).toHaveText(/^P-/);
		await expect(page.getByText(/You don't have a rating yet/)).toBeVisible();

		const ratings = page.getByRole('switch', { name: 'Current ratings' });
		await expect(ratings).not.toBeChecked();
		await ratings.click();
		// The backend's own refusal, and the switch goes back.
		await expect(
			page.getByText('Current ratings can be shown to other players only from age 18.')
		).toBeVisible();
		await expect(page.getByRole('switch', { name: 'Current ratings' })).not.toBeChecked();
		await expectNoAxeViolations(page);
	});

	test('an under-13 birth year is refused, and stays refused after a reload', async ({ page }) => {
		await page.getByLabel('Month').selectOption('6');
		await page.getByLabel('Year').fill(String(new Date().getFullYear() - 5));
		await page.getByRole('radio', { name: 'Man', exact: true }).click();
		await page.getByLabel('Display name').fill('Kid Mock');
		await page.getByRole('button', { name: 'Save and show my code' }).click();

		const refusal = page.getByText("We can't create a player profile with these details.");
		await expect(refusal).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save and show my code' })).toHaveCount(0);
		await page.reload();
		await expect(refusal).toBeVisible();
	});
});

test('signed out, the profile sends the player to sign in and back', async ({ page }) => {
	// The auth guard redirects before the page renders.
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/account\/login\?next=%2Fprofile$/);
	await expect(page.getByTestId('my-code')).toHaveCount(0);
});

test('signed out, the rating history page sends the player to sign in and back', async ({
	page
}) => {
	await page.goto('/profile/ratings');
	await expect(page).toHaveURL(/\/account\/login\?next=%2Fprofile%2Fratings$/);
	await expect(page.getByTestId('rating-history')).toHaveCount(0);
});
