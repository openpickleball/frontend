import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildCode } from '../src/lib/domain/codes';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// The offline match queue (frontend#33), against PUBLIC_API_MOCK=all. The mocks fail every API
// call while the browser is offline, as a lost connection does (src/lib/mocks/browser.ts).

const codeOf = (key: string) => PLAYERS.find((p) => p.key === key)!.code;
const MATCH_URL = /\/matches\/M-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

async function openRecord(page: Page) {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/record');
	await expect(page.getByTestId('chip')).toHaveText(codeOf('tamsin'));
}

async function addPlayer(page: Page, label: string, code: string) {
	const field = page.getByLabel(label);
	await field.fill(code);
	await field.blur();
	await expect(page.getByRole('button', { name: `Remove ${code}` })).toBeVisible();
}

async function recordWhileOffline(page: Page) {
	await page.context().setOffline(true);
	await addPlayer(page, 'Your partner: name or OPEN code', codeOf('oren'));
	await addPlayer(page, 'First opponent: name or OPEN code', codeOf('kit'));
	await addPlayer(page, 'Second opponent: name or OPEN code', codeOf('bea'));
	await page.getByLabel("Game 1, your team's points").fill('11');
	await page.getByLabel("Game 1, opponents' points").fill('4');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page.getByText(/Match saved on this device/)).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
}

const waiting = (page: Page) => page.getByTestId('queue-waiting');

test('a match recorded offline waits on the device, then is sent when back online', async ({
	page
}) => {
	await openRecord(page);
	await recordWhileOffline(page);

	await expect(waiting(page)).toContainText('1 match waiting to send');
	await expect(waiting(page)).toContainText(
		"It's saved on this device. We'll send it when you're back online."
	);

	await page.context().setOffline(false);
	await expect(page.getByText('Your match was sent')).toBeVisible();
	await expect(waiting(page)).toHaveCount(0);

	await page.getByRole('button', { name: 'View' }).click();
	await expect(page).toHaveURL(MATCH_URL);
	await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();
});

test('sign out warns before it deletes unsent matches', async ({ page }) => {
	// The side nav has Sign out from 1024px, so no page has to load while offline. The mock build
	// has no app shell worker to serve one.
	await page.setViewportSize({ width: 1280, height: 800 });
	await openRecord(page);
	await recordWhileOffline(page);

	await page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).first().click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByText("1 match hasn't been sent yet.", { exact: false })).toBeVisible();
	await dialog.getByRole('button', { name: 'Stay signed in' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(waiting(page)).toContainText('1 match waiting to send');
});

// A well-formed code that no player has: the backend answers 422 once it is sent.
const NOBODY = buildCode('player', 'QQQQQQQ');

/** Record a singles match against NOBODY offline, then go online so the backend refuses it. */
async function queueRefused(page: Page) {
	await page.context().setOffline(true);
	await page.getByRole('radio', { name: 'Singles' }).click();
	await addPlayer(page, 'Your opponent: name or OPEN code', NOBODY);
	await page.getByLabel("Game 1, your team's points").fill('11');
	await page.getByLabel("Game 1, opponents' points").fill('5');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(waiting(page)).toContainText('1 match waiting to send');
	await page.context().setOffline(false);
	const refused = page.getByTestId('queue-refused');
	await expect(refused).toContainText("This match wasn't recorded");
	await expect(refused).toContainText('No player has this OPEN Code.');
	return refused;
}

test('a queued match the backend refuses can be fixed and recorded again', async ({ page }) => {
	await openRecord(page);
	const refused = await queueRefused(page);

	await refused.getByRole('button', { name: 'Fix and record again' }).click();
	await expect(page).toHaveURL(/\/record\?fix=/);
	await expect(page.getByText('Fix 1 thing to record this match')).toBeVisible();
	await page.getByRole('button', { name: `Remove ${NOBODY}` }).click();
	await addPlayer(page, 'Your opponent: name or OPEN code', codeOf('kit'));
	await page.getByRole('button', { name: 'Record and confirm score' }).click();

	await expect(page).toHaveURL(MATCH_URL);
	await expect(page.getByTestId('queue-refused')).toHaveCount(0);
});

for (const scheme of ['dark', 'light'] as const) {
	test(`the queue notice has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await openRecord(page);
		await recordWhileOffline(page);
		await expect(waiting(page)).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test(`a refused match has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await openRecord(page);
		await queueRefused(page);

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});
}
