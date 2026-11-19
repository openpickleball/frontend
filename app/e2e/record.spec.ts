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
	await addPlayer(page, 'Your partner: name or OPEN code', codeOf('oren'));
	await addPlayer(page, 'First opponent: name or OPEN code', codeOf('kit'));
	await addPlayer(page, 'Second opponent: name or OPEN code', codeOf('bea'));
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

test('opens the new match from the cache, waiting for the other team', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
	await page.getByRole('button', { name: 'Record and confirm score' }).click();

	await expect(page).toHaveURL(MATCH_URL);
	await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();
	await expect(page.getByText('You confirmed this score.').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
	await expect(page.getByText(/not found|couldn't find/i)).toHaveCount(0);
});

test('accepts a code in any spelling and shows the canonical one', async ({ page }) => {
	await openRecord(page);
	const field = page.getByLabel('Your partner: name or OPEN code');
	await field.fill(codeOf('oren').toLowerCase().replaceAll('-', ' '));
	await field.press('Enter');
	await expect(page.getByRole('button', { name: `Remove ${codeOf('oren')}` })).toBeFocused();
});

test('singles hides the partner and the second opponent', async ({ page }) => {
	await openRecord(page);
	await page.getByText('Singles', { exact: true }).click();
	await expect(page.getByLabel('Your partner: name or OPEN code')).toHaveCount(0);
	await expect(page.getByLabel('Second opponent: name or OPEN code')).toHaveCount(0);
	await addPlayer(page, 'Your opponent: name or OPEN code', codeOf('kit'));
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

test('records a doubles match by finding the players by name', async ({ page }) => {
	await openRecord(page);
	const partner = page.getByRole('combobox', { name: 'Your partner: name or OPEN code' });

	// Under 3 characters nothing is offered.
	await partner.fill('or');
	await expect(page.getByRole('listbox')).toBeHidden();

	// The keyboard path: arrow to the option, Enter to pick.
	await partner.fill('oren');
	await expect(page.getByRole('option', { name: /Oren Quill/ })).toBeVisible();
	await expect(page.getByTestId('search-status').first()).toHaveText(/1 player found/);
	await partner.press('ArrowDown');
	await partner.press('Enter');
	await expect(page.getByRole('button', { name: `Remove ${codeOf('oren')}` })).toBeVisible();
	await expect(page.getByText('Oren Quill')).toBeVisible();
	// Enter picked the player. It did not submit the form.
	await expect(page).toHaveURL(/\/record$/);

	// The pointer path, matching a later word of the name, in any case.
	await page.getByRole('combobox', { name: 'First opponent: name or OPEN code' }).fill('ASHD');
	const kit = page.getByRole('option', { name: /Kit Ashdown/ });
	await expect(kit).toBeVisible();
	expect((await kit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await kit.click();
	await expect(page.getByRole('button', { name: `Remove ${codeOf('kit')}` })).toBeVisible();

	// A code still works in the last slot.
	await addPlayer(page, 'Second opponent: name or OPEN code', codeOf('bea'));

	await page.getByLabel("Game 1, your team's points").fill('11');
	await page.getByLabel("Game 1, opponents' points").fill('6');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
	await expect(page.getByText('Match recorded')).toBeVisible();
});

test('says so when no player has that name, and Escape closes the list', async ({ page }) => {
	await openRecord(page);
	const box = page.getByRole('combobox', { name: 'Your partner: name or OPEN code' });
	await box.fill('zzzz');
	await expect(
		page.getByText('No players found. Check the spelling or enter their OPEN code.').first()
	).toBeVisible();

	await box.fill('rosa');
	await expect(page.getByRole('option', { name: /Rosa Fenwick/ })).toBeVisible();
	await box.press('Escape');
	await expect(page.getByRole('listbox')).toBeHidden();
	await expect(box).toHaveValue('rosa');
});

test('does not offer a player already in the match', async ({ page }) => {
	await openRecord(page);
	await addPlayer(page, 'Your partner: name or OPEN code', codeOf('oren'));
	const box = page.getByRole('combobox', { name: 'First opponent: name or OPEN code' });
	await box.fill('oren');
	await expect(page.getByText('No players found.').first()).toBeVisible();
	await expect(page.getByRole('option')).toHaveCount(0);
	// Neither is the signed-in player.
	await box.fill('tamsin');
	await expect(page.getByText('No players found.').first()).toBeVisible();
});

test('the search list has no WCAG 2.1 AA violations in either theme', async ({ page }) => {
	await openRecord(page);
	for (const scheme of ['dark', 'light'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.getByRole('combobox', { name: 'Your partner: name or OPEN code' }).fill('');
		await page.getByRole('combobox', { name: 'Your partner: name or OPEN code' }).fill('mar');
		await expect(page.getByRole('option', { name: /Bea Marlowe/ })).toBeVisible();
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	}
});
