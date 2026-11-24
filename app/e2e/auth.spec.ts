import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	MOCK_KEYS,
	MOCK_PASSWORD,
	PLAYERS,
	UNVERIFIED_EMAIL,
	VERIFIED_EMAIL
} from '../src/lib/mocks/fixtures';
import {
	fillSignup,
	fillSignupAccount,
	fillSignupDetails,
	signIn,
	signOut,
	submitAgeCheck,
	submitSignIn
} from './helpers';

// Runs against PUBLIC_API_MOCK=all (see playwright.config.ts). Every test gets a new browser
// context, so the mock backend starts from its seed data each time.

type Mail = { kind: string; to: string; key: string | null };

/** What the mock backend would have emailed so far. */
async function mail(page: Page): Promise<Mail[]> {
	return page.evaluate(
		() => (window as unknown as { __openMock: { mail: () => Mail[] } }).__openMock.mail() as Mail[]
	);
}

async function keyFor(page: Page, kind: string, to: string): Promise<string> {
	let key: string | null | undefined;
	await expect
		.poll(async () => {
			key = (await mail(page)).filter((m) => m.kind === kind && m.to === to).at(-1)?.key;
			return key;
		})
		.toBeTruthy();
	return key as string;
}

test('sign up, verify the email from the link, sign in, then sign out', async ({ page }) => {
	const email = 'new.player@example.com';
	const password = 'a-long-enough-pass';

	await page.goto('/account/signup');
	await fillSignup(page, email, password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
	await expect(page.getByText(email)).toBeVisible();
	// There is no resend button: this backend confirms by link.
	await expect(page.getByRole('button', { name: /resend|send it again/i })).toHaveCount(0);

	// The link in the email. Opening it confirms the address but does not sign anyone in.
	const key = await keyFor(page, 'verify_email', email);
	await page.goto(`/account/verify-email/${key}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Email verified' })).toBeVisible();
	await page.getByRole('link', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/account\/login$/);

	await submitSignIn(page, email, password);
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	await signOut(page);
	// Signed out for real: a signed-in page sends us back to sign in.
	await page.goto('/record');
	await expect(page).toHaveURL(/\/account\/login\?next=%2Frecord$/);
});

test('signing up with an address that has an account looks the same', async ({ page }) => {
	await page.goto('/account/signup');
	await fillSignup(page, VERIFIED_EMAIL, 'a-long-enough-pass');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
	await expect(page.getByText(VERIFIED_EMAIL)).toBeVisible();
});

test('the details stay locked until the age check passes', async ({ page }) => {
	await page.goto('/account/signup');
	await fillSignupAccount(page, 'locked.player@example.com', 'a-long-enough-pass');
	const locked = [
		page.getByRole('radio', { name: 'Woman' }),
		page.getByLabel('First name'),
		page.getByRole('combobox', { name: 'City (optional)' }),
		page.getByLabel(/I agree to the Terms of Service/),
		page.getByRole('button', { name: 'Create account' })
	];
	for (const control of locked) await expect(control).toBeDisabled();

	await submitAgeCheck(page);
	await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
	for (const control of locked) await expect(control).toBeEnabled();
});

test('an under-13 birth year gets the refusal at the age check', async ({ page }) => {
	const message = "We can't create an account with these details.";
	await page.goto('/account/signup');
	await fillSignupAccount(page, 'young.player@example.com', 'a-long-enough-pass');
	await submitAgeCheck(page, String(new Date().getFullYear() - 5));
	await expect(page.locator('[data-slot="alert"]')).toHaveText(message);
	await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0);
	await expect(page.getByLabel('First name')).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
	expect(await mail(page)).toEqual([]);

	// The session keeps refusing, as the backend does, even with an adult year. The alert from
	// the first answer reads the same, so wait for the second answer before checking it.
	await page.getByLabel('Year').fill('1990');
	const [second] = await Promise.all([
		page.waitForResponse(
			(response) =>
				response.url().endsWith('/_allauth/browser/v1/auth/signup/age-check') &&
				response.request().method() === 'POST'
		),
		page.getByRole('button', { name: 'Continue' }).click()
	]);
	expect(second.status()).toBe(400);
	expect(await second.json()).toMatchObject({ errors: [{ code: 'signup_refused' }] });
	await expect(page.locator('[data-slot="alert"]')).toHaveText(message);
	await expect(page.getByLabel('First name')).toBeDisabled();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toHaveCount(0);
});

test('a server error on the account fields goes back to screen 1', async ({ page }) => {
	// The client accepts this password. The backend refuses it as too common. (The client and the
	// mocks share one email check, so a server-only email error cannot be reached.)
	await page.goto('/account/signup');
	await fillSignup(page, 'new.player@example.com', 'password');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Create account' })).toBeVisible();
	await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
		'aria-invalid',
		'true'
	);
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toHaveCount(0);
});

test('a city chosen from the suggestions signs up', async ({ page }) => {
	const email = 'city.player@example.com';
	await page.goto('/account/signup');
	await fillSignup(page, email, 'a-long-enough-pass', {
		city: 'Maple',
		cityOption: 'Maple Hollow, Ontario, Canada'
	});
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
	await expect(page.getByText(email)).toBeVisible();
});

test('signing up with City left empty works', async ({ page }) => {
	const email = 'nocity.player@example.com';
	await page.goto('/account/signup');
	await fillSignup(page, email, 'a-long-enough-pass');
	await expect(page.getByRole('combobox', { name: 'City (optional)' })).toHaveValue('');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
	await expect(page.getByText(email)).toBeVisible();
});

test('sign in stays usable while a sign-up is waiting for its link', async ({ page }) => {
	await page.goto('/account/signup');
	await fillSignup(page, 'waiting.player@example.com', 'a-long-enough-pass');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();

	await page.getByRole('link', { name: 'Go to sign in' }).click();
	await expect(page).toHaveURL(/\/account\/login$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
	await expect(page.getByText('waiting.player@example.com')).toBeVisible();

	// Someone with a verified account can sign in right here.
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).toHaveURL(/\/$/);
});

test('sign out removes the saved code and email from this browser', async ({ page }) => {
	const rosa = PLAYERS.find((p) => p.key === 'rosa')!;
	// This account has no player yet, so the code is typed in and kept on the device.
	await page.goto(`/account/verify-email/${MOCK_KEYS.verifyEmail}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Email verified' })).toBeVisible();
	await signIn(page, UNVERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/profile');
	await page.getByRole('textbox', { name: 'Your OPEN code' }).fill(rosa.code);
	await page.getByRole('button', { name: 'Save code' }).click();
	await expect(page.getByTestId('my-code')).toHaveText(rosa.code);
	const saved = () =>
		page.evaluate(() =>
			Object.keys(localStorage).filter((key) => key.startsWith('open:v1:my-player-code:'))
		);
	expect(await saved()).toHaveLength(1);

	await page
		.getByRole('region', { name: 'Account' })
		.getByRole('button', { name: 'Sign out' })
		.click();
	await expect(page).toHaveURL(/\/account\/login/);
	expect(await saved()).toEqual([]);
});

test('a wrong password shows an error and stays on sign in', async ({ page }) => {
	await page.goto('/account/login');
	await submitSignIn(page, VERIFIED_EMAIL, 'not-the-password');
	await expect(page.getByRole('alert')).toContainText("That email and password don't match.");
	await expect(page).toHaveURL(/\/account\/login$/);
});

test('keyboard focus stays on the Sign in button after a failed sign-in', async ({ page }) => {
	await page.goto('/account/login');
	await page.getByLabel('Email').fill(VERIFIED_EMAIL);
	await page.getByLabel('Password', { exact: true }).fill('not-the-password');
	const button = page.getByRole('button', { name: 'Sign in' });
	await button.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('alert')).toContainText("That email and password don't match.");
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
});

test('the form names what is missing', async ({ page }) => {
	await page.goto('/account/login');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	const email = page.getByLabel('Email');
	await expect(email).toHaveAttribute('aria-invalid', 'true');
	await expect(email).toBeFocused();
	await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
		'aria-invalid',
		'true'
	);
});

test('a signed-out visit to a signed-in page goes to sign in, then back', async ({ page }) => {
	await page.goto('/matches');
	await expect(page).toHaveURL(/\/account\/login\?next=%2Fmatches$/);
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).toHaveURL(/\/matches$/);
});

test('a session that ends mid-use sends the player to sign in, then back', async ({ page }) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page.getByRole('heading', { name: 'Recent matches' })).toBeVisible();

	// The backend forgets the session, as when it expires or the player signs out elsewhere.
	await page.evaluate(() =>
		(window as unknown as { __openMock: { reset: () => void } }).__openMock.reset()
	);
	await page.getByRole('link', { name: 'Matches' }).filter({ visible: true }).first().click();

	await expect(page).toHaveURL(/\/account\/login\?next=%2Fmatches$/);
	await expect(page.getByText('You were signed out.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).toHaveURL(/\/matches$/);
	await expect(page.getByText('You were signed out.')).toHaveCount(0);
});

test('next never sends the player to another site', async ({ page, baseURL }) => {
	for (const next of ['https://evil.example/', '//evil.example', '/\\evil.example']) {
		await page.goto(`/account/login?next=${encodeURIComponent(next)}`);
		await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
		await expect(page).toHaveURL(`${baseURL}/`);
		await signOut(page);
	}
});

test('next that cannot be opened, or hides a second slash, still ends on a real page', async ({
	page,
	baseURL
}) => {
	// A path with dot segments that resolve to //evil.example is not trusted.
	await page.goto('/account/login?next=' + encodeURIComponent('/..//evil.example'));
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).toHaveURL(`${baseURL}/`);
	await signOut(page);

	// Encoded slashes: the value is `/%2F%2Fevil.com`.
	await page.goto('/account/login?next=/%252F%252Fevil.com');
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).not.toHaveURL(/account\/login/);
	expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
	await page.goto('/');
	await signOut(page);

	// A mistyped page: the player leaves Sign in and stays on this site.
	await page.goto('/account/login?next=/recrod');
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).not.toHaveURL(/account\/login/);
	expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
});

test('another account never sees the last account code on the profile', async ({ page }) => {
	const tamsin = PLAYERS.find((p) => p.key === 'tamsin')!;
	const oren = PLAYERS.find((p) => p.key === 'oren')!;

	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/profile');
	await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);

	// Sign out from the profile page, where it is in the Account section.
	await page
		.getByRole('region', { name: 'Account' })
		.getByRole('button', { name: 'Sign out' })
		.click();
	await expect(page).toHaveURL(/\/account\/login/);

	await signIn(page, oren.accountEmail!, MOCK_PASSWORD);
	await page.getByRole('link', { name: 'Profile' }).filter({ visible: true }).click();
	await expect(page.getByTestId('my-code')).toHaveText(oren.code);
	await expect(page.getByText(tamsin.code)).toHaveCount(0);
});

test('a signed-in player on an account page is sent home', async ({ page, baseURL }) => {
	await page.goto('/account/login');
	await submitSignIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(page).toHaveURL(`${baseURL}/`);
	await page.goto('/account/signup');
	await expect(page).toHaveURL(`${baseURL}/`);
});

test('an old confirmation link says it does not work and points to sign in', async ({ page }) => {
	await page.goto('/account/verify-email/not-a-real-key');
	await expect(
		page.getByRole('heading', { level: 1, name: "This link doesn't work anymore" })
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('reset a password from the emailed link, then sign in with the new one', async ({ page }) => {
	await page.goto('/account/login');
	await page.getByRole('link', { name: 'Forgot your password?' }).click();
	await expect(page).toHaveURL(/\/account\/password\/reset$/);
	await page.getByLabel('Email').fill(VERIFIED_EMAIL);
	await page.getByRole('button', { name: 'Send reset link' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();

	const key = await keyFor(page, 'reset_password', VERIFIED_EMAIL);
	await page.goto(`/account/password/reset/key/${key}`);
	await page.getByLabel('New password', { exact: true }).fill('a-brand-new-pass-77');
	await page.getByRole('button', { name: 'Save new password' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Password changed' })).toBeVisible();
	// A reset does not sign anyone in.
	await page.getByRole('link', { name: 'Sign in' }).click();
	await submitSignIn(page, VERIFIED_EMAIL, 'a-brand-new-pass-77');
	await expect(page).toHaveURL(/\/$/);
});

test('a reset link that no longer works offers a new one', async ({ page }) => {
	await page.goto('/account/password/reset/key/not-a-real-key');
	await expect(
		page.getByRole('heading', { level: 1, name: "This link doesn't work anymore" })
	).toBeVisible();
	await page.getByRole('link', { name: 'Send a new link' }).click();
	await expect(page).toHaveURL(/\/account\/password\/reset$/);
});

test('the seeded reset key from the mocks works for a deep link', async ({ page }) => {
	await page.goto(`/account/password/reset/key/${MOCK_KEYS.resetPassword}`);
	await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
});

// Axe on the states the route list can't reach by URL. Zero violations, in both themes.
async function expectNoViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

for (const scheme of ['dark', 'light'] as const) {
	test(`the auth states have no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });

		// Sign in: field errors, then the wrong password banner.
		await page.goto('/account/login');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
		await expectNoViolations(page);
		await submitSignIn(page, VERIFIED_EMAIL, 'not-the-password');
		await expect(page.getByRole('alert')).toBeVisible();
		await expectNoViolations(page);

		// Sign up with a weak password, then check your email.
		await page.goto('/account/signup');
		await expectNoViolations(page);
		await fillSignupAccount(page, 'new.player@example.com', 'password');
		// Screen 2 after the age check. Not before: axe reads the radios and Create account as low
		// contrast while the fieldset locks them (WCAG exempts inactive controls, axe does not see it).
		await submitAgeCheck(page);
		await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
		await expectNoViolations(page);
		await fillSignupDetails(page);
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await expectNoViolations(page);
		await page.getByLabel('Password', { exact: true }).fill('a-long-enough-pass');
		await page.getByLabel('Confirm password').fill('a-long-enough-pass');
		await page.getByRole('button', { name: 'Continue' }).click();
		// Back on screen 2, with the details kept from before.
		await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
		await expect(page.getByLabel('First name')).not.toHaveValue('');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
		await expectNoViolations(page);

		// Email verified, and a link that no longer works.
		const key = await keyFor(page, 'verify_email', 'new.player@example.com');
		await page.goto(`/account/verify-email/${key}`);
		await expect(page.getByRole('heading', { level: 1, name: 'Email verified' })).toBeVisible();
		await expectNoViolations(page);
		await page.goto('/account/verify-email/not-a-real-key');
		await expect(page.getByRole('heading', { level: 1, name: /doesn't work/ })).toBeVisible();
		await expectNoViolations(page);

		// Password reset: sent, and changed.
		await page.goto('/account/password/reset');
		await page.getByLabel('Email').fill(VERIFIED_EMAIL);
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
		await expectNoViolations(page);
		await page.goto(`/account/password/reset/key/${MOCK_KEYS.resetPassword}`);
		await page.getByLabel('New password', { exact: true }).fill('a-brand-new-pass-77');
		await page.getByRole('button', { name: 'Save new password' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Password changed' })).toBeVisible();
		await expectNoViolations(page);
	});
}
