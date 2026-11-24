import { expect, type Page } from '@playwright/test';

/** Fill in and submit the sign-in form, which must already be open. */
export async function submitSignIn(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * Fill in the sign-up form, which must already be open, as a made-up player born in June 1990
 * would. `birthYear` overrides the year. Does not submit.
 */
export async function fillSignup(
	page: Page,
	email: string,
	password: string,
	{ birthYear = '1990' }: { birthYear?: string } = {}
) {
	await page.getByLabel('Month').selectOption('6');
	await page.getByLabel('Year').fill(birthYear);
	await page.getByRole('radio', { name: 'Woman' }).click();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByLabel('Confirm password').fill(password);
}

/** Open the sign-in page and sign in. Resolves once the player has landed on home. */
export async function signIn(page: Page, email: string, password: string) {
	await page.goto('/account/login');
	await submitSignIn(page, email, password);
	await expect(page).toHaveURL(/\/$/);
}

/** Sign out from the profile page (the top bar has no Sign out), then wait for the sign-in page. */
export async function signOut(page: Page) {
	await page.getByRole('link', { name: 'Profile' }).filter({ visible: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).first().click();
	await expect(page).toHaveURL(/\/account\/login$/);
}
