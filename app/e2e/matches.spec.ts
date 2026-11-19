import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildCode } from '../src/lib/domain/codes';
import { MATCHES, MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all (see playwright.config.ts), signed in as player@example.com
// (Tamsin Vale), who has 26 matches: 20 on the first page, 6 on the second. Every test gets a new
// browser context, so the mock backend starts from its seed data each time.

const tamsin = PLAYERS.find((p) => p.key === 'tamsin')!;
const matchCode = (random: string) => buildCode('match', random);

// Seed matches waiting on Tamsin (the two the other side confirmed) and one she confirmed herself.
const WAITING_ON_ME = matchCode('7QK2H9WD3NF');
const WAITING_ON_ME_TOO = matchCode('3FTB8ZRMK6P');
const ALREADY_CONFIRMED_BY_ME = matchCode('X4NC2GHJ9VQ');

// The oldest match she is in: past the first page, so a deep link has to scan for it.
const oldest = MATCHES.filter((m) => [...m.teamA, ...m.teamB].includes('tamsin')).reduce((a, b) =>
	a.playedOn <= b.playedOn ? a : b
);

test.beforeEach(async ({ page }) => {
	await signIn(page, VERIFIED_EMAIL, MOCK_PASSWORD);
});

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

function rowFor(page: Page, code: string) {
	return page.locator(`a[href$="/matches/${code}"]`);
}

test.describe('home', () => {
	test('lists what needs her, then what waits on the other team, then recent matches', async ({
		page
	}) => {
		await expect(page).toHaveTitle('OPEN Pickleball');
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
		await expect(page.getByRole('link', { name: 'Record a match' })).toBeVisible();

		const needs = page.getByRole('heading', { level: 2, name: 'Needs your confirmation' });
		const waiting = page.getByRole('heading', { level: 2, name: 'Waiting for the other team' });
		const recent = page.getByRole('heading', { level: 2, name: 'Recent matches' });
		await expect(needs).toBeVisible();
		await expect(waiting).toBeVisible();
		await expect(recent).toBeVisible();
		const [needsBox, waitingBox, recentBox] = [
			await needs.boundingBox(),
			await waiting.boundingBox(),
			await recent.boundingBox()
		];
		expect(needsBox!.y).toBeLessThan(waitingBox!.y);
		expect(waitingBox!.y).toBeLessThan(recentBox!.y);
		await expect(page.getByRole('heading', { name: 'Pending matches' })).toHaveCount(0);

		const needsList = page.getByRole('list', { name: 'Needs your confirmation' });
		await expect(needsList.getByTestId('match-row')).toHaveCount(2);
		await expect(rowFor(page, WAITING_ON_ME)).toContainText('Needs your confirmation.');
		await expect(rowFor(page, WAITING_ON_ME_TOO)).toBeVisible();
		await expect(page.getByTestId('more-needs')).toHaveCount(0);

		const waitingList = page.getByRole('list', { name: 'Waiting for the other team' });
		await expect(waitingList.getByTestId('match-row')).toHaveCount(1);
		await expect(
			waitingList.locator(`a[href$="/matches/${ALREADY_CONFIRMED_BY_ME}"]`)
		).toContainText('You confirmed this score. Waiting for the other team.');
		await expect(
			page.getByRole('list', { name: 'Recent matches' }).getByTestId('match-row')
		).toHaveCount(5);

		await page.getByRole('link', { name: 'All matches' }).click();
		await expect(page).toHaveURL(/\/matches$/);
	});

	test('copies the code', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy code' }).click();
		await expect(page.getByText('Code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tamsin.code);
	});

	test('has no WCAG 2.1 AA violations', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Needs your confirmation' })).toBeVisible();
		await expectNoAxeViolations(page);
	});
});

test.describe('match history', () => {
	test('pages forward and back', async ({ page }) => {
		await page.goto('/matches');
		await expect(page.getByRole('heading', { level: 1, name: 'Matches' })).toBeVisible();
		await expect(page.getByTestId('range')).toHaveText('1–20 of 26');
		await expect(page.getByTestId('match-row')).toHaveCount(20);
		await expect(page.getByRole('link', { name: 'Newer' })).toHaveAttribute(
			'aria-disabled',
			'true'
		);

		await page.getByRole('link', { name: 'Older' }).click();
		await expect(page).toHaveURL(/\/matches\?page=2$/);
		await expect(page.getByTestId('range')).toHaveText('21–26 of 26');
		await expect(page.getByTestId('match-row')).toHaveCount(6);
		await expect(page.getByRole('link', { name: 'Older' })).toHaveAttribute(
			'aria-disabled',
			'true'
		);

		await page.getByRole('link', { name: 'Newer' }).click();
		await expect(page).toHaveURL(/\/matches$/);
		await expect(page.getByTestId('range')).toHaveText('1–20 of 26');
	});

	test('shows a page past the end as empty, with a way back', async ({ page }) => {
		await page.goto('/matches?page=9');
		await expect(page.getByText('There are no matches on this page.')).toBeVisible();
		await page.getByRole('link', { name: 'Back to the newest' }).click();
		await expect(page.getByTestId('range')).toHaveText('1–20 of 26');
	});

	test('has no WCAG 2.1 AA violations', async ({ page }) => {
		await page.goto('/matches');
		await expect(page.getByTestId('range')).toBeVisible();
		await expectNoAxeViolations(page);
	});
});

test.describe('match detail', () => {
	test('confirms a match and shows the new status', async ({ page }) => {
		await rowFor(page, WAITING_ON_ME_TOO).click();
		await expect(page).toHaveURL(new RegExp(`/matches/${WAITING_ON_ME_TOO}$`));
		await expect(page.getByRole('heading', { level: 1, name: 'Singles, best of 3' })).toBeVisible();
		await expect(page.getByText('Pending', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Is this the right score?' })).toBeVisible();

		await page.getByRole('button', { name: 'Confirm score' }).click();

		// Rosa had confirmed already, so Tamsin's confirmation makes it count.
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'confirmed');
		await expect(panel.getByRole('heading', { name: 'Confirmed' })).toBeFocused();
		await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Dispute' })).toHaveCount(0);

		// The home list no longer asks for it.
		await page.getByRole('link', { name: 'Home' }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Needs your confirmation' }).getByTestId('match-row')
		).toHaveCount(1);
		await page.getByRole('link', { name: 'All matches' }).click();
		await expect(
			rowFor(page, WAITING_ON_ME_TOO).getByText('Confirmed', { exact: true })
		).toBeVisible();
	});

	test('confirms a match the other team has not, then waits for the other team', async ({
		page
	}) => {
		await rowFor(page, WAITING_ON_ME).click();
		// Bea's team confirmed it, Tamsin's has not.
		await expect(page.getByText(/The other team has confirmed this score/)).toBeVisible();
		await page.getByRole('button', { name: 'Confirm score' }).click();
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
	});

	test('says it is waiting for the other team when her team already confirmed', async ({
		page
	}) => {
		await rowFor(page, ALREADY_CONFIRMED_BY_ME).click();
		// The API says her team confirmed, so there is nothing to press.
		await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();
		await expect(page.getByText('You confirmed this score.')).toBeVisible();
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'pending');
		await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Dispute' })).toHaveCount(0);
	});

	test('shows her own decision after a dispute', async ({ page }) => {
		await rowFor(page, WAITING_ON_ME).click();
		await page.getByRole('button', { name: 'Dispute', exact: true }).click();
		await page
			.getByRole('alertdialog', { name: 'Dispute this score?' })
			.getByRole('button', { name: 'Dispute score' })
			.click();
		await expect(page.getByText(/You said this score is wrong/)).toBeVisible();
		// It leaves "Needs your confirmation" on home.
		await page.getByRole('link', { name: 'Home' }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Needs your confirmation' }).getByTestId('match-row')
		).toHaveCount(1);
	});

	test('disputes a match through the dialog, with Cancel focused first', async ({ page }) => {
		await rowFor(page, WAITING_ON_ME).click();
		await page.getByRole('button', { name: 'Dispute', exact: true }).click();

		const dialog = page.getByRole('alertdialog', { name: 'Dispute this score?' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await expectNoAxeViolations(page);

		// Cancel changes nothing.
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'pending');

		await page.getByRole('button', { name: 'Dispute', exact: true }).click();
		await dialog.getByRole('button', { name: 'Dispute score' }).click();
		await expect(page.getByText('Score disputed')).toBeVisible();
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'disputed');
		await expect(page.getByRole('heading', { name: 'Disputed' })).toBeFocused();
		await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
	});

	test('opens a match from a deep link, scanning the list when the cache is empty', async ({
		page
	}) => {
		const code = matchCode(oldest.random);
		await page.goto(`/matches/${code}`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/Singles|Doubles/);
		await expect(page.getByText(code)).toBeVisible();
		await expect(page.getByRole('table', { name: 'Score by game' })).toBeAttached();
		await expectNoAxeViolations(page);
	});

	test('shows a hidden table of the score for screen readers', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const table = page.getByRole('table', { name: 'Score by game' });
		await expect(table.getByRole('row')).toHaveCount(3);
		await expect(table.getByRole('rowheader').first()).toContainText('Tamsin Vale (you)');
	});

	test('says so when the code is not one of her matches', async ({ page }) => {
		await page.goto(`/matches/${matchCode('00000000000')}`);
		await expect(
			page.getByRole('heading', { level: 1, name: "We couldn't find this match" })
		).toBeVisible();
		await expectNoAxeViolations(page);
		await page.locator('#main').getByRole('link', { name: 'Matches', exact: true }).click();
		await expect(page).toHaveURL(/\/matches$/);
	});

	test('says so when the code is not a match code at all', async ({ page }) => {
		await page.goto('/matches/not-a-code');
		await expect(
			page.getByRole('heading', { level: 1, name: "We couldn't find this match" })
		).toBeVisible();
	});

	test('has no WCAG 2.1 AA violations in either theme', async ({ page }) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto(`/matches/${WAITING_ON_ME}`);
			await expect(page.getByTestId('status-panel')).toBeVisible();
			await expectNoAxeViolations(page);
		}
	});
});
