import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all. The player reaches Profile with the Profile link, not a full
// load, so the pages mount in the order a player sees them. The "Confirm it's you" prompt must
// still open on top of the delete dialog and take a mouse click.

async function openPrompt(page: Page) {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.getByRole('link', { name: 'Profile' }).filter({ visible: true }).click();
	await expect(page).toHaveURL(/\/profile$/);
	await page.getByRole('button', { name: /Delete your account/ }).click();

	const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Type delete to confirm').fill('delete');
	await dialog.getByRole('button', { name: 'Delete account' }).click();

	const prompt = page.getByRole('dialog', { name: "Confirm it's you" });
	await expect(prompt).toBeVisible();
	return { dialog, prompt };
}

test('confirms the prompt with the mouse after reaching Profile by its link', async ({ page }) => {
	const { prompt } = await openPrompt(page);
	await prompt.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
	await prompt.getByRole('button', { name: 'Confirm' }).click({ timeout: 5000 });

	await expect(page).toHaveURL(/\/account\/login$/);
	await expect(page.getByText('Your account was deleted.')).toBeVisible();
});

test('cancels the prompt with the mouse and keeps the delete dialog open', async ({ page }) => {
	const { dialog, prompt } = await openPrompt(page);
	await prompt.getByRole('button', { name: 'Cancel' }).click({ timeout: 5000 });

	await expect(prompt).toBeHidden();
	await expect(dialog).toBeVisible();
	await expect(page).toHaveURL(/\/profile$/);
});
