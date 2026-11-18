import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all (see playwright.config.ts). Every test gets a new browser
// context, so the mock backend starts from its seed data each time.

const codeOf = (key: string) => PLAYERS.find((p) => p.key === key)!.code;
const MATCH_URL = /\/matches\/M-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

async function openRecord(page: Page) {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
	await page.goto('/record');
	await expect(page.getByRole('heading', { level: 1, name: 'Record a match' })).toBeVisible();
	// The player's own code is already on team A.
	await expect(page.getByTestId('chip')).toHaveText(codeOf('tamsin'));
}

/** Add a player by typing the code and leaving the box, as a player does. */
async function addPlayer(page: Page, label: string, code: string) {
	const field = page.getByLabel(label);
	await field.fill(code);
	await field.blur();
	await expect(page.getByRole('button', { name: `Remove ${code}` })).toBeVisible();
}

async function fillDoublesMatch(page: Page) {
	await addPlayer(page, "Your partner's OPEN code", codeOf('oren'));
	await addPlayer(page, "First opponent's OPEN code", codeOf('kit'));
	await addPlayer(page, "Second opponent's OPEN code", codeOf('bea'));
	await page.getByLabel("Game 1, your team's points").fill('11');
	await page.getByLabel("Game 1, opponents' points").fill('6');
	await page.getByRole('button', { name: 'Add a game' }).click();
	await page.getByLabel("Game 2, your team's points").fill('11');
	await page.getByLabel("Game 2, opponents' points").fill('8');
}

test('records a doubles match and lands on its page', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
	await expect(page.getByText('This confirms the score for your team.')).toBeVisible();
	await page.getByRole('button', { name: 'Record and confirm score' }).click();

	await expect(page).toHaveURL(MATCH_URL);
	await expect(page.getByText('Match recorded')).toBeVisible();
});

test('accepts a code in any spelling and shows the canonical one', async ({ page }) => {
	await openRecord(page);
	const field = page.getByLabel("Your partner's OPEN code");
	await field.fill(codeOf('oren').toLowerCase().replaceAll('-', ' '));
	await field.press('Enter');
	await expect(page.getByRole('button', { name: `Remove ${codeOf('oren')}` })).toBeFocused();
});

test('singles hides the partner and the second opponent', async ({ page }) => {
	await openRecord(page);
	await page.getByText('Singles', { exact: true }).click();
	await expect(page.getByLabel("Your partner's OPEN code")).toHaveCount(0);
	await expect(page.getByLabel("Second opponent's OPEN code")).toHaveCount(0);
	await addPlayer(page, "Your opponent's OPEN code", codeOf('kit'));
	await page.getByLabel("Game 1, your team's points").fill('11');
	await page.getByLabel("Game 1, opponents' points").fill('4');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
});

test('a bad score shows the error inline and in the summary', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
	await page.getByLabel("Game 2, your team's points").fill('11');
	await page.getByLabel("Game 2, opponents' points").fill('10');
	await page.getByLabel("Game 2, opponents' points").blur();
	const message = 'Game 2: the winner must win by 2 points.';
	await expect(page.getByText(message)).toBeVisible();
	await expect(page.getByLabel("Game 2, your team's points")).toHaveAttribute(
		'aria-invalid',
		'true'
	);

	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(/\/record$/);
	const summary = page.getByRole('alert').filter({ hasText: 'Fix 1 thing to record this match' });
	await expect(summary).toBeFocused();
	await summary.getByRole('link', { name: message }).click();
	await expect(page.getByLabel("Game 2, your team's points")).toBeFocused();

	// Fixing the score lets the match through.
	await page.getByLabel("Game 2, opponents' points").fill('8');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
});

test('recording the same match twice says it was already recorded', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
	const first = new URL(page.url()).pathname;

	await page.goto('/record');
	await expect(page.getByTestId('chip')).toHaveText(codeOf('tamsin'));
	await fillDoublesMatch(page);
	await page.getByRole('button', { name: 'Record and confirm score' }).click();

	await expect(page.getByText('This match was already recorded')).toBeVisible();
	await expect(page).toHaveURL(/\/record$/);
	await expect(page.getByRole('link', { name: 'See the match' })).toHaveAttribute('href', first);
	// The form keeps what was typed.
	await expect(page.getByLabel("Game 1, your team's points")).toHaveValue('11');
});

test('has no WCAG 2.1 AA violations, blank or with errors', async ({ page }) => {
	await openRecord(page);
	const scan = async () => {
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	};
	await scan();

	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'things to record this match' })
	).toBeVisible();
	await scan();
});
