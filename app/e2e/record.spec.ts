import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
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

test('controls are at least 44px tall and Scoring fits on one row on a phone', async ({ page }) => {
	await openRecord(page);
	await page.getByRole('button', { name: 'Add a game' }).click();
	const heights = async (locators: ReturnType<Page['locator']>[]) =>
		Promise.all(locators.map(async (l) => (await l.boundingBox())?.height ?? 0));
	const controls = [
		page.getByRole('button', { name: 'Remove game 1' }),
		page.getByRole('button', { name: 'Add a game' }),
		page.getByRole('radio', { name: 'Singles' }),
		page.getByRole('radio', { name: '11', exact: true }),
		page.getByRole('radio', { name: 'Rally' })
	];
	for (const height of await heights(controls)) expect(height).toBeGreaterThanOrEqual(44);
	// "Games to" and "Scoring" share one row.
	const target = await page.getByText('Games to', { exact: true }).boundingBox();
	const scoring = await page.getByText('Scoring', { exact: true }).last().boundingBox();
	expect(Math.abs(target!.y - scoring!.y)).toBeLessThan(4);
});

test('records a doubles match and lands on its page', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
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
	await expect(page.getByText(/^You confirmed this score,/).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
	await expect(page.getByText(/not found|couldn't find/i)).toHaveCount(0);
});

test('keeps the draft through a reload and drops it once the match is recorded', async ({
	page
}) => {
	await openRecord(page);
	await fillDoublesMatch(page);

	// A reload keeps the chips and scores.
	await page.reload();
	for (const key of ['oren', 'kit', 'bea']) {
		await expect(page.getByRole('button', { name: `Remove ${codeOf(key)}` })).toBeVisible();
	}
	await expect(page.getByLabel("Game 2, your team's points")).toHaveValue('11');
	await expect(page.getByLabel("Game 2, opponents' points")).toHaveValue('8');

	// Leaving by a link and coming back keeps them too.
	await page.getByRole('link', { name: 'Matches' }).first().click();
	await expect(page).toHaveURL(/\/matches$/);
	await page.goBack();
	await expect(page.getByRole('button', { name: `Remove ${codeOf('kit')}` })).toBeVisible();

	// Once recorded, a new visit starts empty.
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
	await page.goto('/record');
	await expect(page.getByTestId('chip')).toHaveCount(1);
	await expect(page.getByLabel("Game 1, your team's points")).toHaveValue('');
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
	await page.getByRole('radio', { name: 'Singles' }).click();
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
	const message = 'Game 2: the winner must win by 2 points.';
	// The error waits for submit, so leaving the row moves nothing.
	await page.getByLabel("Game 2, opponents' points").blur();
	await expect(page.getByText(message)).toHaveCount(0);

	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(/\/record$/);
	const summary = page.getByRole('alert').filter({ hasText: 'Fix 1 thing to record this match' });
	await expect(summary).toBeFocused();
	await expect(page.getByText(message).first()).toBeVisible();
	await expect(page.getByLabel("Game 2, your team's points")).toHaveAttribute(
		'aria-invalid',
		'true'
	);
	await summary.getByRole('link', { name: message }).click();
	await expect(page.getByLabel("Game 2, your team's points")).toBeFocused();

	// Fixing the score lets the match through.
	await page.getByLabel("Game 2, opponents' points").fill('8');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(page).toHaveURL(MATCH_URL);
});

test('the first click on Record works straight after editing a game score', async ({ page }) => {
	await openRecord(page);
	await fillDoublesMatch(page);
	// A score the rules refuse. The click is the first thing after the edit, not Enter or a tab.
	await page.getByLabel("Game 2, opponents' points").fill('10');
	await page.getByRole('button', { name: 'Record and confirm score' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Fix 1 thing to record this match' })
	).toBeFocused();
	await expect(page.getByText('Game 2: the winner must win by 2 points.').first()).toBeVisible();
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

	// The keyboard path: type a name, arrow to the player, Enter to pick, Tab on.
	await partner.fill('');
	await partner.pressSequentially('ore');
	await expect(page.getByRole('option', { name: /Oren Quill/ })).toBeVisible();
	await expect(page.getByTestId('search-status').nth(1)).toHaveText(/1 player found/);
	await partner.press('ArrowDown');
	await partner.press('Enter');
	// Focus lands on the new chip, and a screen reader hears who was added.
	const removeOren = page.getByRole('button', { name: 'Remove Oren Quill' });
	await expect(removeOren).toBeFocused();
	await expect(page.getByTestId('search-status').nth(1)).toHaveText('Added Oren Quill.');
	await expect(page.getByTestId('chip-name')).toHaveText('Oren Quill');
	// Enter picked the player. It did not submit the form.
	await expect(page).toHaveURL(/\/record$/);
	await page.keyboard.press('Tab');
	await expect(
		page.getByRole('combobox', { name: 'First opponent: name or OPEN code' })
	).toBeFocused();

	// The pointer path, matching a later word of the name, in any case.
	await page.getByRole('combobox', { name: 'First opponent: name or OPEN code' }).fill('ASHD');
	const kit = page.getByRole('option', { name: /Kit Ashdown/ });
	await expect(kit).toBeVisible();
	expect((await kit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await kit.click();
	await expect(page.getByRole('button', { name: 'Remove Kit Ashdown' })).toBeFocused();

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
	await expect(page.getByTestId('search-note')).toHaveText('That player is already in this match.');
	await expect(page.getByRole('option')).toHaveCount(0);
	// Neither is the signed-in player.
	await box.fill('tamsin');
	await expect(page.getByTestId('search-note')).toHaveText('That player is already in this match.');
});

test('Enter picks the only result without the arrow keys', async ({ page }) => {
	await openRecord(page);
	const box = page.getByRole('combobox', { name: 'First opponent: name or OPEN code' });
	await box.fill('oren quill');
	await expect(page.getByRole('option', { name: /Oren Quill/ })).toBeVisible();
	await box.press('Enter');
	await expect(page.getByRole('button', { name: 'Remove Oren Quill' })).toBeFocused();
	await expect(page.getByText('Pick a player from the list')).toHaveCount(0);
});

test('a long picked name wraps and keeps the code on one line', async ({ page }) => {
	await openRecord(page);
	const long = 'Bartholomew Fitzgerald-Montgomery Abernathy-Whitcombe of Lower Puddleton on Sea';
	// Give a mock player a made-up long name in the saved mock state, then reload. Wait for the
	// page's own requests first: each mocked answer saves the state again.
	await page.waitForLoadState('networkidle');
	await page.evaluate(
		({ code, name }) => {
			const key = 'open-mock-state-v1';
			const state = JSON.parse(sessionStorage.getItem(key)!);
			state.players.find((p: { code: string }) => p.code === code).displayName = name;
			sessionStorage.setItem(key, JSON.stringify(state));
		},
		{ code: codeOf('oren'), name: long }
	);
	await page.reload();
	const box = page.getByRole('combobox', { name: 'First opponent: name or OPEN code' });
	await box.fill('bartholomew');
	await page.getByRole('option', { name: new RegExp(long) }).click();
	const code = page.getByTestId('chip').nth(1);
	await expect(code).toHaveText(codeOf('oren'));
	// The code is one line high, and the page does not scroll sideways.
	expect((await code.boundingBox())!.height).toBeLessThan(30);
	const remove = page.getByRole('button', { name: `Remove ${long}` });
	const target = (await remove.boundingBox())!;
	expect(target.width).toBeGreaterThanOrEqual(44);
	expect(target.height).toBeGreaterThanOrEqual(44);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		page.viewportSize()!.width
	);
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
