import { expect, test } from './fixtures';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn, submitSignIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all. The mock asks for a reauthentication before a delete, because
// a sign-in does not count as one (src/lib/mocks/store.ts). Each test has its own mock state.

test('deletes the account after the typed word and the password, then it cannot sign in', async ({
	page
}) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/profile');
	await page.getByRole('button', { name: /Delete your account/ }).click();

	const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
	await expect(dialog).toBeVisible();
	const confirm = dialog.getByRole('button', { name: 'Delete account' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Type delete to confirm').fill('delete');
	await expect(confirm).toBeEnabled();
	await confirm.click();

	// The backend wants a recent password: the one prompt asks for it, then the delete goes again.
	const prompt = page.getByRole('dialog', { name: "Confirm it's you" });
	await expect(prompt).toBeVisible();
	await prompt.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
	await prompt.getByRole('button', { name: 'Confirm' }).click();

	await expect(page).toHaveURL(/\/account\/login$/);
	await expect(page.getByText('Your account was deleted.')).toBeVisible();
	await expect(page.getByText('You were signed out.')).toHaveCount(0);

	// The account is gone, so the same email and password no longer sign in.
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page.getByRole('alert')).toContainText("That email and password don't match.");
	await expect(page).toHaveURL(/\/account\/login$/);
});
