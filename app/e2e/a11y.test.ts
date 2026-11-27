import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// Every route. Dynamic segments get made-up values.
const ROUTES = [
	'/',
	'/record',
	'/matches',
	'/matches/M-7QK2-H9WD-3NFA',
	'/profile',
	'/profile/two-factor',
	'/does-not-exist',
	'/account/login',
	'/account/signup',
	'/account/verify-email/example-key',
	'/account/password/reset',
	'/account/password/reset/key/example-key'
];

// The signed-in routes send a signed-out visitor to sign in, so sign in to the mock backend first.
const SIGNED_IN_ROUTES = new Set([
	'/',
	'/record',
	'/matches',
	'/matches/M-7QK2-H9WD-3NFA',
	'/profile',
	'/profile/two-factor',
	'/does-not-exist'
]);

function signInAsPlayer(page: Page) {
	return signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
}

for (const scheme of ['dark', 'light'] as const) {
	for (const route of ROUTES) {
		test(`${route} has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			if (SIGNED_IN_ROUTES.has(route)) await signInAsPlayer(page);
			await page.goto(route);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

			const results = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
}
