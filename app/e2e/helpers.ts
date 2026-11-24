import { expect, type Page } from '@playwright/test';

/** Fill in and submit the sign-in form, which must already be open. */
export async function submitSignIn(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export type SignupOptions = {
	/** The birth year typed in. Defaults to 1990. */
	birthYear?: string;
	firstName?: string;
	lastName?: string;
	/** Text typed into City. Leave out to keep City empty. */
	city?: string;
	/** The suggestion to choose once `city` is typed, for example "Riverbend, Ohio, United States". */
	cityOption?: string;
};

/** Fill screen 1 of the sign-up form and go on to screen 2, which must already be open. */
export async function fillSignupAccount(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByLabel('Confirm password').fill(password);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
}

/** Type the birth month (June) and year on screen 2 and press the age Continue. Does not wait. */
export async function submitAgeCheck(page: Page, birthYear = '1990') {
	await page.getByLabel('Month').selectOption('6');
	await page.getByLabel('Year').fill(birthYear);
	await page.getByRole('button', { name: 'Continue' }).click();
}

/**
 * Fill in the sign-up form, which must already be open, as a made-up player born in June would.
 * Goes through both screens and the age check, then fills the details and ticks both agreements.
 * Does not press Create account.
 */
export async function fillSignup(
	page: Page,
	email: string,
	password: string,
	{
		birthYear = '1990',
		firstName = 'Avery',
		lastName = 'Nightjar',
		city,
		cityOption
	}: SignupOptions = {}
) {
	await fillSignupAccount(page, email, password);
	await submitAgeCheck(page, birthYear);
	// The Change link replaces the age Continue once the check has passed.
	await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
	await fillSignupDetails(page, { firstName, lastName, city, cityOption });
}

/** Fill the details under the age check, which must have passed, and tick both agreements. */
export async function fillSignupDetails(
	page: Page,
	{ firstName = 'Avery', lastName = 'Nightjar', city, cityOption }: SignupOptions = {}
) {
	await expect(page.getByRole('radio', { name: 'Woman' })).toBeEnabled();
	await page.getByRole('radio', { name: 'Woman' }).click();
	await page.getByLabel('First name').fill(firstName);
	await page.getByLabel('Last name').fill(lastName);
	if (city !== undefined) {
		await page.getByRole('combobox', { name: 'City (optional)' }).fill(city);
		if (cityOption !== undefined) await page.getByRole('option', { name: cityOption }).click();
	}
	await page.getByLabel(/I agree to the Terms of Service/).check();
	await page.getByLabel(/I agree to the Privacy Policy/).check();
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
