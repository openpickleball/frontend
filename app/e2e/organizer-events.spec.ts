import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
	GRANTED_CLUB,
	LARKSPUR,
	MANAGER_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL,
	THISTLE_BAY,
	VERIFIED_EMAIL
} from '../src/lib/mocks/fixtures';
import { signIn, submitSignIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all, on a phone: the tab bar is the nav.
// `window.__openMock.turnOnTwoFactor` and `removeMembership` change the mock's made-up accounts.

const NOT_FOUND = "We couldn't find this page";

type MockHelpers = {
	turnOnTwoFactor: (email: string) => void;
	removeMembership: (email: string, organizer: string) => void;
};

const tabBar = (page: Page) =>
	page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });

/** Sign in as an account with two-factor on, through the code step. */
async function signInWithCode(page: Page, email: string) {
	await page.goto('/account/login');
	await submitSignIn(page, email, MOCK_PASSWORD);
	await page.getByLabel('Code from your app').fill(MOCK_TOTP_CODE);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/$/);
}

async function turnOnTwoFactor(page: Page, email: string) {
	// The mocks start after the page loads.
	await page.waitForFunction(() => '__openMock' in window);
	await page.evaluate(
		(email) => (window as unknown as { __openMock: MockHelpers }).__openMock.turnOnTwoFactor(email),
		email
	);
}

async function removeMembership(page: Page, email: string, organizer: string) {
	await page.evaluate(
		({ email, organizer }) =>
			(window as unknown as { __openMock: MockHelpers }).__openMock.removeMembership(
				email,
				organizer
			),
		{ email, organizer }
	);
}

async function openEvents(page: Page) {
	await tabBar(page).getByRole('link', { name: 'Events' }).click();
	await expect(page).toHaveURL(/\/organizer$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
}

async function fillEvent(page: Page, name: string, kind: string) {
	const dialog = page.getByRole('dialog', { name: 'New Event' });
	await dialog.getByLabel('Name').fill(name);
	await dialog.getByLabel('Kind').selectOption({ label: kind });
	await dialog.getByLabel('Start date').fill('2027-03-06');
	await dialog.getByLabel('End date').fill('2027-03-07');
	return dialog;
}

test('a player who is not a member never sees the area or calls the Event operations', async ({
	page
}) => {
	const calls: string[] = [];
	page.on('request', (request) => {
		const url = request.url();
		if (url.includes('/api/v1/organizer/events') || url.includes('club-grants')) calls.push(url);
	});
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await expect(tabBar(page).getByRole('link', { name: 'Profile' })).toBeVisible();
	await expect(tabBar(page).getByRole('link', { name: 'Events' })).toHaveCount(0);
	await page.goto('/organizer');
	await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
	await expect(page.getByText(/organizer/i)).toHaveCount(0);
	expect(calls).toEqual([]);
});

test('an admin without two-factor sees the list and the prompt, and create is refused', async ({
	page
}) => {
	await signIn(page, ORGANIZER_EMAIL, MOCK_PASSWORD);
	await openEvents(page);
	await expect(page.getByText('Larkspur Winter League', { exact: true })).toBeVisible();
	await expect(page.getByText('Organizer actions need two-factor authentication.')).toBeVisible();
	await page.getByRole('button', { name: 'New Event' }).click();
	const dialog = await fillEvent(page, 'Made-up Spring Open', 'Tournament');
	// Without two-factor the grants read fails, so the club is a code.
	await expect(dialog.getByLabel('Club code')).toBeVisible();
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await expect(
		dialog.getByText(/You can't create Events for this organizer right now/)
	).toBeVisible();
	await expect(dialog.getByRole('link', { name: 'Set up two-factor' })).toBeVisible();
});

test('a match manager creates, changes and deletes an Event', async ({ page }) => {
	await signInWithCode(page, MANAGER_EMAIL);
	await openEvents(page);
	await expect(
		page.getByText(
			'Thistle Bay Social is waiting for verification. You can create Events once OPEN verifies it.'
		)
	).toBeVisible();

	await page.getByRole('button', { name: 'New Event' }).click();
	const dialog = await fillEvent(page, 'Made-up Spring Open', 'Tournament');
	await expect(dialog.getByText('Larkspur Paddle League')).toBeVisible();
	await dialog.getByLabel('Club code').fill(GRANTED_CLUB);
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await expect(dialog).toBeHidden();
	const row = page.getByRole('listitem').filter({ hasText: 'Made-up Spring Open' });
	await expect(row.getByText('Tournament')).toBeVisible();

	await page.getByRole('button', { name: 'Edit Made-up Spring Open' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit Event' });
	await expect(edit.getByText(GRANTED_CLUB)).toBeVisible();
	await edit.getByLabel('Kind').selectOption({ label: 'League' });
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(row.getByText('League', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Edit Larkspur Winter League' }).click();
	await edit.getByLabel('Name').fill('Made-up Renamed League');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(
		edit.getByText(/This Event has matches, so its name and dates can't change/)
	).toBeVisible();
	await edit.getByRole('button', { name: 'Cancel' }).click();

	await page.getByRole('button', { name: 'Delete Made-up Spring Open' }).click();
	const confirm = page.getByRole('alertdialog', { name: 'Delete Made-up Spring Open?' });
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByText('Made-up Spring Open')).toHaveCount(0);
});

test('an admin with two-factor picks a club from the granted clubs', async ({ page }) => {
	await page.goto('/account/login');
	await turnOnTwoFactor(page, ORGANIZER_EMAIL);
	await signInWithCode(page, ORGANIZER_EMAIL);
	await openEvents(page);
	await page.getByRole('button', { name: 'New Event' }).click();
	const dialog = await fillEvent(page, 'Made-up Club Night', 'Verified rec play');
	await dialog
		.getByLabel('Club', { exact: true })
		.selectOption({ label: 'Juniper Court Club (Brindlequay)' });
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Made-up Club Night', { exact: true })).toBeVisible();
});

test('a member taken out of every organizer loses the area on the next load', async ({ page }) => {
	await signInWithCode(page, MANAGER_EMAIL);
	await openEvents(page);
	await removeMembership(page, MANAGER_EMAIL, LARKSPUR);
	await removeMembership(page, MANAGER_EMAIL, THISTLE_BAY);
	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible();
	await expect(tabBar(page).getByRole('link', { name: 'Events' })).toHaveCount(0);
});
