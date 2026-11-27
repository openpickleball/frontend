import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildCode } from '../src/lib/domain/codes';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// The info popovers (frontend#285), against PUBLIC_API_MOCK=all, signed in as Tamsin Vale. The
// Pixel 7 project has touch, so `tap()` is a real tap.

// Bea's dispute keeps this one disputed. Tamsin's team has not vouched for the held one.
const STILL_DISPUTED = buildCode('match', 'R5GK9WBD2XF');
const HELD = buildCode('match', 'H2ZA6TQN4CJ');

test.beforeEach(async ({ page }) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
});

async function expectNoAxeViolations(page: Page) {
	// Axe reads colors mid fade-in otherwise.
	await page.waitForFunction(() =>
		document.getAnimations().every((animation) => animation.playState !== 'running')
	);
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

test('opens the disputed popover on the match page with a tap, and a tap outside closes it', async ({
	page
}) => {
	await page.goto(`/matches/${STILL_DISPUTED}`);
	const button = page
		.getByTestId('status-panel')
		.getByRole('button', { name: 'What does disputed mean?' });
	await button.tap();
	const popover = page.getByRole('dialog', { name: 'What does disputed mean?' });
	await expect(popover).toBeVisible();
	await expect(popover).toContainText('A dispute ends when every player who disputed the score');
	await expect(button).toHaveAttribute('aria-expanded', 'true');

	await page.getByRole('heading', { level: 1 }).tap();
	await expect(popover).toHaveCount(0);
	await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('explains on hold and vouch on a held match, and Escape gives focus back', async ({
	page
}) => {
	await page.goto(`/matches/${HELD}`);
	const button = page.getByRole('button', { name: 'What do on hold and vouch mean?' });
	await button.tap();
	const popover = page.getByRole('dialog', { name: 'What do on hold and vouch mean?' });
	await expect(popover).toContainText('One player from each team needs to vouch');
	await page.keyboard.press('Escape');
	await expect(popover).toHaveCount(0);
	await expect(button).toBeFocused();
});

for (const scheme of ['dark', 'light'] as const) {
	test(`has no WCAG 2.1 AA violations with each popover open (${scheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });

		await page.goto(`/matches/${STILL_DISPUTED}`);
		await page.getByRole('button', { name: 'What does disputed mean?' }).tap();
		await expect(page.getByRole('dialog', { name: 'What does disputed mean?' })).toBeVisible();
		await expectNoAxeViolations(page);

		await page.goto(`/matches/${HELD}`);
		await page.getByRole('button', { name: 'What do on hold and vouch mean?' }).tap();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expectNoAxeViolations(page);

		await page.goto('/');
		await page.getByRole('button', { name: 'What do disputed and on hold mean?' }).tap();
		const progress = page.getByRole('dialog', { name: 'What do disputed and on hold mean?' });
		await expect(progress).toContainText("doesn't count while it is disputed");
		await expectNoAxeViolations(page);

		await page.goto('/profile');
		await page.getByRole('button', { name: 'What does reliability mean?' }).tap();
		const reliability = page.getByRole('dialog', { name: 'What does reliability mean?' });
		await expect(reliability).toContainText('How sure a rating is, from 0 to 100.');
		await expect(reliability).not.toContainText(/OPEN rating/i);
		await expectNoAxeViolations(page);
	});
}
