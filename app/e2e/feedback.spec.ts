import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// The feedback form lives on tally.so. These tests never reach it: a small stand-in page answers
// every tally.so request and posts the message Tally's embed posts once the form is there. The
// real form is never submitted.
const STAND_IN = `<!doctype html>
<html lang="en">
	<head><title>Feedback form</title></head>
	<body>
		<main>
			<label for="feedback">Feedback</label>
			<textarea id="feedback"></textarea>
			<button type="submit">Submit</button>
		</main>
		<script>
			parent.postMessage(JSON.stringify({ event: 'Tally.FormLoaded', payload: { formId: 'EqWB5B' } }), '*');
		</script>
	</body>
</html>`;

/** Stand in for Tally, and record every address asked for there. */
async function standInForTally(page: Page) {
	const asked: string[] = [];
	await page.route('https://tally.so/**', (route) => {
		asked.push(route.request().url());
		return route.fulfill({ contentType: 'text/html', body: STAND_IN });
	});
	return asked;
}

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

async function openAndClose(page: Page, asked: string[]) {
	const button = page.getByRole('button', { name: 'Send feedback' });
	await expect(button).toBeVisible();
	// Nothing goes to Tally until the player opens the form.
	expect(asked).toEqual([]);

	await button.click();
	const dialog = page.getByRole('dialog', { name: 'Send feedback' });
	await expect(dialog).toBeVisible();
	const form = page.frameLocator('iframe[title="Feedback form"]');
	await expect(form.getByLabel('Feedback')).toBeVisible();
	await expect(dialog.getByText('Loading the form')).toHaveCount(0);
	// The embed address carries no personal data: the form id and the display option only.
	expect(asked).toEqual(['https://tally.so/embed/EqWB5B?hideTitle=1']);

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(button).toBeFocused();

	await button.click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(button).toBeFocused();
}

test.describe('Send feedback', () => {
	test('opens and closes from Profile on a phone', async ({ page }) => {
		const asked = await standInForTally(page);
		await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
		await page.goto('/profile');
		await expect(page.getByRole('heading', { level: 2, name: 'Feedback' })).toBeVisible();
		await openAndClose(page, asked);
	});

	test('opens and closes from the side nav on a desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		const asked = await standInForTally(page);
		await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await openAndClose(page, asked);
	});

	test('the dialog is centered on a phone, with room either side', async ({ page }) => {
		await standInForTally(page);
		await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
		await page.goto('/profile');
		await page.getByRole('button', { name: 'Send feedback' }).click();
		const box = await page.getByRole('dialog').boundingBox();
		const viewport = page.viewportSize();
		expect(box && viewport).toBeTruthy();
		if (!box || !viewport) return;
		expect(box.x).toBeCloseTo(16, 0);
		expect(viewport.width - box.x - box.width).toBeCloseTo(16, 0);
		expect(Math.abs(box.y - (viewport.height - box.y - box.height))).toBeLessThanOrEqual(2);
	});

	test('offers the form in a new tab when the device is offline', async ({ page, context }) => {
		const asked = await standInForTally(page);
		await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
		await page.goto('/profile');
		await expect(page.getByRole('heading', { level: 2, name: 'Feedback' })).toBeVisible();
		await context.setOffline(true);
		await page.getByRole('button', { name: 'Send feedback' }).click();
		const link = page.getByRole('link', { name: /open the form in a new tab/ });
		await expect(link).toHaveAttribute('href', 'https://tally.so/r/EqWB5B');
		await expect(link).toHaveAttribute('target', '_blank');
		expect(asked).toEqual([]);
		await context.setOffline(false);
	});

	for (const scheme of ['dark', 'light'] as const) {
		test(`the open dialog has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await standInForTally(page);
			await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
			await page.goto('/profile');
			await page.getByRole('button', { name: 'Send feedback' }).click();
			await expect(
				page.frameLocator('iframe[title="Feedback form"]').getByLabel('Feedback')
			).toBeVisible();
			await expectNoAxeViolations(page);
		});
	}
});
