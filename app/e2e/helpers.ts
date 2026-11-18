import { expect, type Page } from '@playwright/test';

/** Fill in and submit the sign-in form, which must already be open. */
export async function submitSignIn(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Open the sign-in page and sign in. Resolves once the player has landed on home. */
export async function signIn(page: Page, email: string, password: string) {
	await page.goto('/account/login');
	await submitSignIn(page, email, password);
	await expect(page).toHaveURL(/\/$/);
}

/** Sign out from the shell, then wait for the sign-in page. */
export async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).first().click();
	await expect(page).toHaveURL(/\/account\/login$/);
}
