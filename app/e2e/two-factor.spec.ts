import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
	MFA_REQUIRED_EMAIL,
	MOCK_PASSWORD,
	MOCK_RECOVERY_CODES,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL,
	TWO_FACTOR_EMAIL,
	VERIFIED_EMAIL
} from '../src/lib/mocks/fixtures';
import { signIn, submitSignIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all. The mock accepts MOCK_TOTP_CODE as the current code from any
// authenticator app, and each recovery code once (src/lib/mocks/store.ts).

/** Sign in as the account with two-factor on, through the code step. */
async function signInWithCode(page: Page, code: string = MOCK_TOTP_CODE) {
	await page.goto('/account/login');
	await submitSignIn(page, TWO_FACTOR_EMAIL, MOCK_PASSWORD);
	await page.getByLabel('Code from your app').fill(code);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/$/);
}

/** Answer the reauthentication prompt with the password. */
async function confirmWithPassword(page: Page) {
	const prompt = page.getByRole('dialog', { name: "Confirm it's you" });
	await expect(prompt).toBeVisible();
	await prompt.getByLabel('Password', { exact: true }).fill(MOCK_PASSWORD);
	await prompt.getByRole('button', { name: 'Confirm' }).click();
	await expect(prompt).toBeHidden();
}

/** Call the OPEN API from the page, with the CSRF cookie, as the app would. */
async function callApi(page: Page, method: 'GET' | 'POST', path: string, body?: unknown) {
	return page.evaluate(
		async ({ method, path, body }) => {
			const token = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/)?.[1] ?? '';
			const response = await fetch(path, {
				method,
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token) },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			return { status: response.status, body: (await response.json()) as unknown };
		},
		{ method, path, body }
	);
}

test('signs in with a code, after a wrong one, a reload and a start over', async ({ page }) => {
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/account\/login\?next=%2Fprofile$/);
	await submitSignIn(page, TWO_FACTOR_EMAIL, MOCK_PASSWORD);
	await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible();

	// Start over ends the waiting login and shows the password form again.
	await page.getByRole('button', { name: 'Start over' }).click();
	await expect(page.getByLabel('Email')).toBeVisible();
	await submitSignIn(page, TWO_FACTOR_EMAIL, MOCK_PASSWORD);

	await page.getByLabel('Code from your app').fill('000000');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText('Incorrect code.')).toBeVisible();

	// The backend keeps the stage: a reload shows the code step again.
	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible();

	await page.getByLabel('Code from your app').fill(MOCK_TOTP_CODE);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/profile$/);
});

test('signs in with a recovery code', async ({ page }) => {
	await page.goto('/account/login');
	await submitSignIn(page, TWO_FACTOR_EMAIL, MOCK_PASSWORD);
	await page.getByRole('button', { name: 'Use a recovery code' }).click();
	await page.getByLabel('Recovery code').fill(MOCK_RECOVERY_CODES[0]);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('turns two-factor on as an organizer member, then may act for the organizer', async ({
	page
}) => {
	await signIn(page, ORGANIZER_EMAIL, MOCK_PASSWORD);
	const [membership] = (await callApi(page, 'GET', '/api/v1/organizer/organizers')).body as {
		organizer: string;
	}[];
	const event = {
		organizer: membership.organizer,
		name: 'Made-up Winter Open',
		kind: 'tournament',
		start_date: '2026-12-05',
		end_date: '2026-12-06'
	};
	// Without two-factor the backend refuses an Event.
	expect((await callApi(page, 'POST', '/api/v1/organizer/events', event)).status).toBe(403);

	await page.goto('/profile');
	await expect(page.getByText('Organizer actions need two-factor authentication.')).toBeVisible();
	await page.getByRole('link', { name: 'Set up two-factor' }).first().click();
	await expect(page).toHaveURL(/\/profile\/two-factor$/);
	await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();

	await page.getByLabel('Code from your app').fill(MOCK_TOTP_CODE);
	await page.getByRole('button', { name: 'Turn on' }).click();
	// A fresh sign-in is not a recent reauthentication.
	await confirmWithPassword(page);
	await expect(page.getByText(/shown only once/)).toBeVisible();
	await expect(
		page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem')
	).toHaveCount(10);
	await expect(page.getByText(/Two-factor authentication is on/)).toBeVisible();
	await expect(page.getByText('Organizer actions need two-factor authentication.')).toBeHidden();

	// The session passed two-factor when it enrolled: organizer operations go through.
	expect((await callApi(page, 'GET', '/api/v1/organizer/events')).status).toBe(200);
	expect((await callApi(page, 'POST', '/api/v1/organizer/events', event)).status).toBe(201);
});

test('Cancel in the prompt leaves two-factor off and shows no error', async ({ page }) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/profile/two-factor');
	await page.getByLabel('Code from your app').fill(MOCK_TOTP_CODE);
	await page.getByRole('button', { name: 'Turn on' }).click();
	const prompt = page.getByRole('dialog', { name: "Confirm it's you" });
	await prompt.getByLabel('Password', { exact: true }).fill('not-the-password');
	await prompt.getByRole('button', { name: 'Confirm' }).click();
	await expect(prompt.getByText('Incorrect password.')).toBeVisible();
	await prompt.getByRole('button', { name: 'Cancel' }).click();
	await expect(prompt).toBeHidden();
	await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('makes new recovery codes through the prompt', async ({ page }) => {
	await signInWithCode(page);
	await page.goto('/profile/two-factor');
	await expect(page.getByText('10 of 10 recovery codes unused.')).toBeVisible();
	await page.getByRole('button', { name: 'Make new recovery codes' }).click();
	await confirmWithPassword(page);
	const codes = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
	await expect(codes).toHaveCount(10);
	await expect(codes.filter({ hasText: MOCK_RECOVERY_CODES[0] })).toHaveCount(0);
});

test('turns two-factor off with a code in the prompt', async ({ page }) => {
	await signInWithCode(page);
	await page.goto('/profile/two-factor');
	await page.getByRole('button', { name: 'Turn off', exact: true }).click();
	await page.getByRole('button', { name: 'Turn off two-factor' }).click();
	const prompt = page.getByRole('dialog', { name: "Confirm it's you" });
	await prompt.getByRole('button', { name: 'Use a code instead' }).click();
	await prompt.getByLabel('Code from your app').fill(MOCK_TOTP_CODE);
	await prompt.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
	await expect(page.getByText(/Two-factor authentication is off/)).toBeVisible();
});

test('mfa_required shows the setup link', async ({ page }) => {
	await signIn(page, MFA_REQUIRED_EMAIL, MOCK_PASSWORD);
	const toast = page.locator('[data-sonner-toast]').filter({
		hasText: 'This needs two-factor authentication.'
	});
	await expect(toast).toHaveCount(1);
	await toast.getByRole('button', { name: 'Set up two-factor' }).click();
	await expect(page).toHaveURL(/\/profile\/two-factor$/);
	await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
});

test('says nothing about organizers to a player who is not a member', async ({ page }) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	for (const path of ['/profile', '/profile/two-factor']) {
		await page.goto(path);
		await expect(
			page
				.getByRole('heading', { level: 2, name: 'Two-factor authentication' })
				.or(page.getByRole('button', { name: 'Turn on' }))
		).toBeVisible();
		await expect(page.locator('main')).not.toContainText(/organizer/i);
	}
});
