import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Every stub route. Dynamic segments get made-up values.
const ROUTES = [
	'/',
	'/record',
	'/matches',
	'/matches/M-7QK2-H9WD-3NFA',
	'/profile',
	'/account/login',
	'/account/signup',
	'/account/verify-email/example-key',
	'/account/password/reset',
	'/account/password/reset/key/example-key'
];

for (const scheme of ['dark', 'light'] as const) {
	for (const route of ROUTES) {
		test(`${route} has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto(route);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

			const results = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
}
