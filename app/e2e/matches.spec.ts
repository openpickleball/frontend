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

// Disputed matches. Tamsin disputed the older one alone, so she can withdraw it. She withdrew
// her dispute of the newer one, and Bea's dispute keeps it disputed.
const MY_DISPUTE = matchCode(
	MATCHES.find((m) => m.status === 'disputed' && m.random !== 'R5GK9WBD2XF')!.random
);
const STILL_DISPUTED = matchCode('R5GK9WBD2XF');

// A confirmed match between Oren and Bea. Tamsin is not in it, so she cannot read it.
const NOT_HERS = matchCode('C4VD8RME2TX');

// The oldest match she is in: past the first page of her history, and still one request by URL.
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
		await expect(
			page.getByRole('heading', { name: 'There are no matches on this page' })
		).toBeVisible();
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
		await expect(
			page.getByRole('heading', { level: 1, name: /^You (beat|lost to) / })
		).toBeVisible();
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

	test('tabs through the match in reading order and returns focus to Dispute after Cancel', async ({
		page
	}) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const copy = page.getByRole('button', { name: 'Copy code' });
		await copy.focus();
		// Confirm and Dispute come right after the code, before the scoreboard.
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Confirm score' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Dispute', exact: true })).toBeFocused();

		await page.keyboard.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: 'Dispute this score?' });
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		// Tab stays inside the dialog.
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'Dispute score' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Dispute', exact: true })).toBeFocused();
	});

	test('opens a match from its URL on a fresh page load, with nothing cached', async ({ page }) => {
		const code = matchCode(oldest.random);
		await page.goto(`/matches/${code}`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/ (beat|lost to|played) /);
		await expect(page.getByText(code)).toBeVisible();
		await expect(page.getByRole('table', { name: 'Score by game' })).toBeAttached();
		await expectNoAxeViolations(page);
	});

	test('opens a match with the status panel from a link in any status', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'pending');
		await expect(page.getByRole('button', { name: 'Confirm score' })).toBeVisible();
	});

	test('says the same for a match she did not play in as for an unknown code', async ({ page }) => {
		await page.goto(`/matches/${NOT_HERS}`);
		await expect(
			page.getByRole('heading', { level: 1, name: "We couldn't find this match" })
		).toBeVisible();
		await expect(page.getByText(/Only the players in a match can see it/)).toBeVisible();
		await expect(page.getByTestId('status-panel')).toHaveCount(0);
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
		await page.locator('#main').getByRole('link', { name: 'Back to your matches' }).click();
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

test.describe('disputes', () => {
	test('lists her disputed matches on home, after what needs her', async ({ page }) => {
		const disputed = page.getByRole('heading', { level: 2, name: 'Disputed matches' });
		const needs = page.getByRole('heading', { level: 2, name: 'Needs your confirmation' });
		const waiting = page.getByRole('heading', { level: 2, name: 'Waiting for the other team' });
		await expect(disputed).toBeVisible();
		expect((await needs.boundingBox())!.y).toBeLessThan((await disputed.boundingBox())!.y);
		expect((await disputed.boundingBox())!.y).toBeLessThan((await waiting.boundingBox())!.y);

		const list = page.getByRole('list', { name: 'Disputed matches' });
		await expect(list.getByTestId('match-row')).toHaveCount(2);
		await expect(list.locator(`a[href$="/matches/${MY_DISPUTE}"]`)).toContainText(
			'You disputed this score.'
		);
		await expect(list.locator(`a[href$="/matches/${STILL_DISPUTED}"]`)).toBeVisible();
		// A disputed match is not listed again under recent matches.
		await expect(
			page
				.getByRole('list', { name: 'Recent matches' })
				.locator(`a[href$="/matches/${STILL_DISPUTED}"]`)
		).toHaveCount(0);
	});

	test('withdraws her dispute, then offers Confirm and no second dispute', async ({ page }) => {
		await page
			.getByRole('list', { name: 'Disputed matches' })
			.locator(`a[href$="/matches/${MY_DISPUTE}"]`)
			.click();
		await expect(page).toHaveURL(new RegExp(`/matches/${MY_DISPUTE}$`));
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'disputed');
		await expect(panel.getByText(/You said this score is wrong/)).toBeVisible();
		await expect(panel.getByText(/every player who disputed the score withdraws/)).toBeVisible();
		await expect(page.getByText(/moderator/i)).toHaveCount(0);

		await page.getByRole('button', { name: 'Withdraw my dispute' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Withdraw your dispute?' });
		await expect(dialog.getByText(/can't dispute this match again/)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await dialog.getByRole('button', { name: 'Withdraw dispute' }).click();

		// No one else disputed it and it was pending before, so it waits for confirmation again.
		await expect(page.getByText('Dispute withdrawn.', { exact: true })).toBeVisible();
		await expect(panel).toHaveAttribute('data-status', 'pending');
		await expect(page.getByRole('heading', { name: 'Is this the right score?' })).toBeFocused();
		await expect(panel.getByText(/can't dispute this match again/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Dispute', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Withdraw my dispute' })).toHaveCount(0);

		// Home: it left the disputed list and now needs her confirmation.
		await page.getByRole('link', { name: 'Home' }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Disputed matches' }).getByTestId('match-row')
		).toHaveCount(1);
		await expect(
			page
				.getByRole('list', { name: 'Needs your confirmation' })
				.locator(`a[href$="/matches/${MY_DISPUTE}"]`)
		).toBeVisible();
	});

	test('keeps Withdraw away when she already withdrew and another player still disputes', async ({
		page
	}) => {
		await page.goto(`/matches/${STILL_DISPUTED}`);
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'disputed');
		await expect(
			panel.getByText(/You withdrew your dispute\. Another player in this match still says/)
		).toBeVisible();
		await expect(panel.getByText(/the match is voided/)).toBeVisible();
		await expect(panel.getByRole('button')).toHaveCount(0);
	});

	test('has no WCAG 2.1 AA violations on home, a disputed match and the dialog, in either theme', async ({
		page
	}) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/');
			await expect(page.getByRole('heading', { name: 'Disputed matches' })).toBeVisible();
			await expectNoAxeViolations(page);

			await page.goto(`/matches/${MY_DISPUTE}`);
			await expect(page.getByRole('button', { name: 'Withdraw my dispute' })).toBeVisible();
			await expectNoAxeViolations(page);

			await page.getByRole('button', { name: 'Withdraw my dispute' }).click();
			const dialog = page.getByRole('alertdialog', { name: 'Withdraw your dispute?' });
			await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
			// Axe reads colors mid fade-in otherwise.
			await page.waitForFunction(() =>
				document.getAnimations().every((animation) => animation.playState !== 'running')
			);
			await expectNoAxeViolations(page);
			await page.keyboard.press('Escape');
			await expect(page.getByRole('button', { name: 'Withdraw my dispute' })).toBeFocused();
		}
	});
});
