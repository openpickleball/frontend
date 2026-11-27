import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildCode } from '../src/lib/domain/codes';
import {
	CLUB_MATCH,
	EVENT_MATCH,
	MATCHES,
	MOCK_PASSWORD,
	PLAYERS,
	VERIFIED_EMAIL
} from '../src/lib/mocks/fixtures';
import { signIn } from './helpers';

// Runs against PUBLIC_API_MOCK=all (see playwright.config.ts), signed in as player@example.com
// (Tamsin Vale), who has 28 matches: 20 on the first page, 8 on the second. Every test gets a new
// browser context, so the mock backend starts from its seed data each time.

const tamsin = PLAYERS.find((p) => p.key === 'tamsin')!;
const matchCode = (random: string) => buildCode('match', random);

// Seed matches waiting on Tamsin (the two the other side confirmed) and one she confirmed herself.
const WAITING_ON_ME = matchCode('7QK2H9WD3NF');
const WAITING_ON_ME_TOO = matchCode('3FTB8ZRMK6P');
const ALREADY_CONFIRMED_BY_ME = matchCode('X4NC2GHJ9VQ');

// Disputed matches. Tamsin disputed the oldest one alone, so she can withdraw it. She withdrew
// her dispute of R5GK9WBD2XF, and Bea's dispute keeps it disputed. Two more are disputed by
// another player: the Event match and the Club-only match.
const MY_DISPUTE = matchCode(
	MATCHES.find(
		(m) =>
			m.status === 'disputed' &&
			m.decisions.every((d) => d.player === 'tamsin' && d.decision === 'dispute')
	)!.random
);
const STILL_DISPUTED = matchCode('R5GK9WBD2XF');
const EVENT_DISPUTE = matchCode(EVENT_MATCH);
const CLUB_DISPUTE = matchCode(CLUB_MATCH);

// Held matches, both confirmed. Rosa's team and the other match vouched for the first, so
// Tamsin's vouch ends its hold. Tamsin vouched for the second already.
const HELD = matchCode('H2ZA6TQN4CJ');
const HELD_VOUCHED = matchCode('6YEM3HNV8QT');

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

/** The status panel's action buttons. The info button by its title is not one. */
function actionButtons(panel: Locator) {
	return panel.locator('button:not([data-slot="info-button"])');
}

/** A pill of the Show filter on Matches. */
function pill(page: Page, name: 'All' | 'Needs you' | 'Disputed' | 'On hold') {
	return page.getByRole('group', { name: 'Show' }).getByRole('radio', { name, exact: true });
}

function rowFor(page: Page, code: string) {
	return page.locator(`a[href$="/matches/${code}"]`);
}

test.describe('home', () => {
	test('shows her code, then her ratings, then what is in progress', async ({ page }) => {
		await expect(page).toHaveTitle('OPEN Pickleball');
		await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Ratings', 'In progress']);
		await expect(page.getByTestId('my-code')).toHaveText(tamsin.code);
		const order = await page.evaluate(() => {
			const code = document.querySelector('[data-testid="my-code"]');
			const [ratings, progress] = [...document.querySelectorAll('main h2')];
			const follows = (a: Element | null, b: Element | null) =>
				!!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
			return follows(code, ratings) && follows(ratings, progress);
		});
		expect(order).toBe(true);

		// Ratings: the tiles, the demonstration sentence and a Details link to the Ratings tab.
		const ratings = page.getByRole('region', { name: 'Ratings' });
		await expect(ratings.getByTestId('ratings').getByRole('listitem').first()).toBeVisible();
		await expect(ratings.getByText(/demonstration numbers/)).toBeVisible();
		await expect(ratings.getByRole('link', { name: 'Details' })).toHaveAttribute(
			'href',
			'/ratings'
		);
		await expect(
			ratings.getByRole('button', { name: /^What does reliability mean\?$/ })
		).toBeVisible();

		// Oldest first, each row saying what she can do: vouch for the held match, confirm the rest.
		const needsList = page.getByRole('list', { name: 'Needs you' });
		await expect(needsList.getByTestId('match-row')).toHaveCount(3);
		const hrefs = await needsList
			.getByTestId('match-row')
			.evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));
		expect(hrefs).toEqual([
			`/matches/${HELD}`,
			`/matches/${WAITING_ON_ME_TOO}`,
			`/matches/${WAITING_ON_ME}`
		]);
		await expect(needsList.locator(`a[href$="/matches/${HELD}"]`)).toContainText(
			"Vouch for it. It's on hold."
		);
		await expect(needsList.locator(`a[href$="/matches/${WAITING_ON_ME}"]`)).toContainText(
			'Confirm or dispute the score.'
		);
		// All three fit, so there is no See all.
		await expect(page.getByTestId('see-all-needs')).toHaveCount(0);

		// Every dispute, the one she can withdraw too, and both holds. No waiting count.
		await expect(page.getByTestId('in-progress')).toHaveText('4 disputed · 2 on hold');

		// No Recent matches and no Record a match on Home: Record stays in the nav.
		await expect(page.getByRole('list', { name: 'Recent matches' })).toHaveCount(0);
		await expect(page.getByRole('main').getByRole('link', { name: 'Record a match' })).toHaveCount(
			0
		);

		// Her match count, next to In progress, opens Matches.
		const progress = page.getByRole('region', { name: 'In progress' });
		await progress.getByTestId('all-matches').click();
		await expect(page).toHaveURL(/\/matches$/);
	});

	test('the match count next to In progress is the total on Matches', async ({ page }) => {
		const link = page.getByTestId('all-matches');
		await expect(link).toHaveText(/^\d+ matches\s*$/);
		const count = (await link.textContent())?.match(/\d+/)?.[0];
		await link.click();
		await expect(page.getByTestId('range')).toHaveText(new RegExp(`of ${count}$`));
	});

	test('Details opens the Ratings tab', async ({ page }) => {
		await page
			.getByRole('region', { name: 'Ratings' })
			.getByRole('link', { name: 'Details' })
			.click();
		await expect(page).toHaveURL(/\/ratings$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Ratings' })).toBeVisible();
	});

	test('copies the code', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: 'Copy code' }).click();
		await expect(page.getByText('Code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tamsin.code);
	});

	test('has no WCAG 2.1 AA violations, in either theme', async ({ page }) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/');
			await expect(page.getByRole('list', { name: 'Needs you' })).toBeVisible();
			await expectNoAxeViolations(page);
		}
	});
});

test.describe('home needs you count', () => {
	test('shows the same count on the Home tab, on Home and in the Needs you filter', async ({
		page
	}) => {
		const tabBar = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
		await expect(tabBar.getByRole('link', { name: 'Home, 3 need you', exact: true })).toBeVisible();
		await expect(tabBar.getByTestId('needs-you-badge')).toHaveText('3');
		await expect(
			page.getByRole('list', { name: 'Needs you' }).getByTestId('match-row')
		).toHaveCount(3);

		await page.goto('/matches?show=needs-you');
		await expect(page.getByTestId('range')).toHaveText('1–3 of 3');
		await expect(page.getByTestId('match-row').first()).toContainText(
			"Vouch for it. It's on hold."
		);

		// The side nav from 1024px carries the same badge.
		await page.setViewportSize({ width: 1280, height: 800 });
		const side = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
		await expect(side.getByRole('link', { name: 'Home, 3 need you', exact: true })).toBeVisible();
		await expect(side.getByTestId('needs-you-badge')).toHaveText('3');
	});

	test('drops the count when she confirms a match, and clears it when nothing is left', async ({
		page
	}) => {
		const tabBar = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
		await expect(tabBar.getByTestId('needs-you-badge')).toHaveText('3');

		await rowFor(page, WAITING_ON_ME_TOO).click();
		await page.getByRole('button', { name: 'Confirm score' }).click();
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
		await expect(tabBar.getByRole('link', { name: 'Home, 2 need you', exact: true })).toBeVisible();

		await page.goto(`/matches/${WAITING_ON_ME}`);
		await page.getByRole('button', { name: 'Confirm score' }).click();
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
		await expect(
			tabBar.getByRole('link', { name: 'Home, 1 needs you', exact: true })
		).toBeVisible();

		await page.goto(`/matches/${HELD}`);
		await page.getByRole('button', { name: 'This match really happened' }).click();
		await page
			.getByRole('alertdialog', { name: 'Vouch for this match?' })
			.getByRole('button', { name: 'Vouch for match' })
			.click();
		await expect(page.getByText(/^Vouched\./)).toBeVisible();
		await expect(tabBar.getByTestId('needs-you-badge')).toHaveCount(0);
		await expect(tabBar.getByRole('link', { name: 'Home', exact: true })).toBeVisible();

		await tabBar.getByRole('link', { name: 'Home', exact: true }).click();
		await expect(page.getByText("You're all caught up.")).toBeVisible();
	});

	test('follows the In progress counts into the matching filters', async ({ page }) => {
		const line = page.getByTestId('in-progress');
		await line.getByRole('link', { name: '2 on hold' }).click();
		await expect(page).toHaveURL(/\/matches\?show=on-hold$/);
		await expect(pill(page, 'On hold')).toBeChecked();
		await expect(page.getByTestId('range')).toHaveText('1–2 of 2');

		await page.goBack();
		await line.getByRole('link', { name: '4 disputed' }).click();
		await expect(page).toHaveURL(/\/matches\?show=disputed$/);
		await expect(pill(page, 'Disputed')).toBeChecked();
		await expect(page.getByTestId('range')).toHaveText('1–4 of 4');
		await expect(rowFor(page, MY_DISPUTE)).toBeVisible();
	});
});

test.describe('match history', () => {
	test('says who sees the matches on the Match history switch', async ({ page }) => {
		await page.goto('/profile');
		const setting = page.getByRole('switch', { name: 'Match history' });
		await expect(setting).toBeChecked();
		await expect(page.locator('#privacy-match_history-note')).toHaveText(
			'Other signed-in players see your confirmed matches.'
		);
		await setting.click();
		await expect(setting).not.toBeChecked();
		await expect(page.locator('#privacy-match_history-state')).toHaveText('Only me');
		await expect(page.getByText(/Other signed-in players see/)).toHaveCount(0);
	});

	test('pages forward and back', async ({ page }) => {
		await page.goto('/matches');
		await expect(page.getByRole('heading', { level: 1, name: 'Matches' })).toBeVisible();
		await expect(page.getByTestId('range')).toHaveText('1–20 of 28');
		await expect(page.getByTestId('match-row')).toHaveCount(20);
		await expect(page.getByRole('link', { name: 'Newer' })).toHaveAttribute(
			'aria-disabled',
			'true'
		);

		await page.getByRole('link', { name: 'Older' }).click();
		await expect(page).toHaveURL(/\/matches\?page=2$/);
		await expect(page.getByTestId('range')).toHaveText('21–28 of 28');
		await expect(page.getByTestId('match-row')).toHaveCount(8);
		await expect(page.getByRole('link', { name: 'Older' })).toHaveAttribute(
			'aria-disabled',
			'true'
		);

		await page.getByRole('link', { name: 'Newer' }).click();
		await expect(page).toHaveURL(/\/matches$/);
		await expect(page.getByTestId('range')).toHaveText('1–20 of 28');
	});

	test('shows a page past the end as empty, with a way back', async ({ page }) => {
		await page.goto('/matches?page=9');
		await expect(
			page.getByRole('heading', { name: 'There are no matches on this page' })
		).toBeVisible();
		await page.getByRole('link', { name: 'Back to the newest' }).click();
		await expect(page.getByTestId('range')).toHaveText('1–20 of 28');
	});

	test('has no WCAG 2.1 AA violations', async ({ page }) => {
		await page.goto('/matches');
		await expect(page.getByTestId('range')).toBeVisible();
		await expectNoAxeViolations(page);
	});
});

test.describe('matches filter', () => {
	test('opens a filter from a link, and a reload keeps it', async ({ page }) => {
		await page.goto('/matches?show=disputed');
		await expect(pill(page, 'Disputed')).toBeChecked();
		await expect(page.getByTestId('range')).toHaveText('1–4 of 4');
		await expect(rowFor(page, MY_DISPUTE)).toBeVisible();
		await expect(rowFor(page, STILL_DISPUTED)).toBeVisible();
		await expect(rowFor(page, EVENT_DISPUTE)).toBeVisible();
		await expect(rowFor(page, CLUB_DISPUTE)).toBeVisible();
		await expect(page).toHaveTitle('Matches, Disputed, page 1 of 1 · OPEN Pickleball');

		await page.reload();
		await expect(pill(page, 'Disputed')).toBeChecked();
		await expect(page.getByTestId('range')).toHaveText('1–4 of 4');
	});

	test('switches filters with the pills and keeps each in the address', async ({ page }) => {
		await page.goto('/matches?page=2');
		await expect(page.getByTestId('range')).toHaveText('21–28 of 28');

		await pill(page, 'Needs you').click();
		await expect(page).toHaveURL(/\/matches\?show=needs-you$/);
		await expect(pill(page, 'Needs you')).toBeChecked();
		await expect(pill(page, 'Needs you')).toBeFocused();
		// To confirm, and the held match her team has not vouched for.
		await expect(page.getByTestId('range')).toHaveText('1–3 of 3');
		await expect(rowFor(page, WAITING_ON_ME)).toBeVisible();
		await expect(rowFor(page, WAITING_ON_ME_TOO)).toBeVisible();
		await expect(rowFor(page, HELD)).toBeVisible();
		await expect(rowFor(page, ALREADY_CONFIRMED_BY_ME)).toHaveCount(0);

		// The arrow keys move along the pills and choose as they go.
		await page.keyboard.press('ArrowRight');
		await expect(page).toHaveURL(/\/matches\?show=disputed$/);
		await expect(pill(page, 'Disputed')).toBeFocused();
		await page.keyboard.press('ArrowRight');
		await expect(page).toHaveURL(/\/matches\?show=on-hold$/);
		await expect(pill(page, 'On hold')).toBeFocused();
		await expect(rowFor(page, HELD)).toBeVisible();
		await expect(rowFor(page, HELD_VOUCHED)).toBeVisible();
		await expect(page.getByTestId('range')).toHaveText('1–2 of 2');

		await pill(page, 'All').click();
		await expect(page).toHaveURL(/\/matches$/);
		await expect(page.getByTestId('range')).toHaveText('1–20 of 28');
	});

	test('shows every match for an unknown filter', async ({ page }) => {
		await page.goto('/matches?show=waiting');
		await expect(pill(page, 'All')).toBeChecked();
		await expect(page.getByTestId('range')).toHaveText('1–20 of 28');
	});

	test('has no WCAG 2.1 AA violations with a filter, in either theme', async ({ page }) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/matches?show=needs-you');
			await expect(page.getByTestId('range')).toBeVisible();
			await expectNoAxeViolations(page);
		}
	});
});

test.describe('match detail', () => {
	test('confirms a match and shows the new status', async ({ page }) => {
		await rowFor(page, WAITING_ON_ME_TOO).click();
		await expect(page).toHaveURL(new RegExp(`/matches/${WAITING_ON_ME_TOO}$`));
		await expect(
			page.getByRole('heading', { level: 1, name: /^(Singles|Doubles) · \w{3} \d{1,2} \w{3}$/ })
		).toBeVisible();
		await expect(page.getByText('Pending', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Is this the right score?' })).toBeVisible();

		await page.getByRole('button', { name: 'Confirm score' }).click();

		// Rosa had confirmed already, so Tamsin's confirmation makes it count.
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
		// A confirmed match with nothing else to say drops the panel. The badge says it, and the
		// page title takes focus.
		await expect(page.getByTestId('status-panel')).toHaveCount(0);
		await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
		await expect(page.getByRole('button', { name: 'Confirm score' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Dispute' })).toHaveCount(0);

		// The home list no longer asks for it.
		await page.getByRole('link', { name: /^Home/ }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Needs you' }).getByTestId('match-row')
		).toHaveCount(2);
		await page.getByTestId('all-matches').click();
		await expect(
			rowFor(page, WAITING_ON_ME_TOO).getByText('Confirmed', { exact: true })
		).toBeVisible();
	});

	test('confirms a match the other team has not, then waits for the other team', async ({
		page
	}) => {
		await rowFor(page, WAITING_ON_ME).click();
		// Bea's team confirmed it, Tamsin's has not.
		await expect(page.getByText(/The other team confirmed this score/)).toBeVisible();
		await page.getByRole('button', { name: 'Confirm score' }).click();
		await expect(page.getByText('Confirmed. The match now counts.')).toBeVisible();
	});

	test('says it is waiting for the other team when her team already confirmed', async ({
		page
	}) => {
		// Home lists only what needs her, so open it from Matches.
		await page.goto('/matches');
		await rowFor(page, ALREADY_CONFIRMED_BY_ME).click();
		// The API says her team confirmed, so there is nothing to press.
		await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();
		await expect(page.getByText(/^You confirmed this score,/)).toBeVisible();
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
		// It leaves "Needs you" on home.
		await page.getByRole('link', { name: /^Home/ }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Needs you' }).getByTestId('match-row')
		).toHaveCount(2);
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
		const back = page.locator('#main').getByRole('link', { name: 'Matches', exact: true });
		await back.focus();
		// Confirm and Dispute come right after the header, before the scoreboard.
		// The header's title and badges have no stop of their own.
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
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/^(Singles|Doubles) · /);
		await expect(page.getByRole('region', { name: 'Details' }).getByText(code)).toBeVisible();
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
	test('counts her disputed matches under In progress on home, the one she can withdraw too', async ({
		page
	}) => {
		await expect(page.getByTestId('in-progress')).toContainText('4 disputed');
		await page.getByTestId('in-progress').getByRole('link', { name: '4 disputed' }).click();
		const list = page.getByRole('list', { name: 'Your matches, Disputed' });
		await expect(list.getByTestId('match-row')).toHaveCount(4);
		await expect(list.locator(`a[href$="/matches/${MY_DISPUTE}"]`)).toContainText(
			'You disputed this score.'
		);
		await expect(list.locator(`a[href$="/matches/${STILL_DISPUTED}"]`)).toBeVisible();
	});

	test('withdraws her dispute, then offers Confirm and no second dispute', async ({ page }) => {
		await page.goto(`/matches/${MY_DISPUTE}`);
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'disputed');
		await expect(panel.getByText(/You said this score is wrong/)).toBeVisible();
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

		// Home: it left the disputed count and now needs her confirmation.
		await page.getByRole('link', { name: /^Home/ }).filter({ visible: true }).first().click();
		await expect(page.getByTestId('in-progress')).toContainText('3 disputed');
		await expect(
			page.getByRole('list', { name: 'Needs you' }).locator(`a[href$="/matches/${MY_DISPUTE}"]`)
		).toBeVisible();
	});

	test('keeps Withdraw away when she already withdrew and another player still disputes', async ({
		page
	}) => {
		await page.goto(`/matches/${STILL_DISPUTED}`);
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'disputed');
		await expect(
			panel.getByText(/You withdrew your dispute, but another player still says/)
		).toBeVisible();
		await expect(actionButtons(panel)).toHaveCount(0);
	});

	test('has no WCAG 2.1 AA violations on home, a disputed match and the dialog, in either theme', async ({
		page
	}) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/');
			await expect(page.getByTestId('in-progress')).toBeVisible();
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

test.describe('holds', () => {
	test('lists the held match she can vouch for under Needs you, and counts both holds', async ({
		page
	}) => {
		const needsList = page.getByRole('list', { name: 'Needs you' });
		const heldRow = needsList.locator(`a[href$="/matches/${HELD}"]`);
		await expect(heldRow).toContainText("Vouch for it. It's on hold.");
		// A held confirmed match reads On hold, not Confirmed.
		await expect(heldRow.getByText('On hold', { exact: true })).toBeVisible();
		await expect(heldRow.getByText('Confirmed', { exact: true })).toHaveCount(0);
		// Her team vouched for the other one, so it doesn't need her.
		await expect(needsList.locator(`a[href$="/matches/${HELD_VOUCHED}"]`)).toHaveCount(0);
		await expect(page.getByTestId('in-progress')).toContainText('2 on hold');

		await page.getByTestId('in-progress').getByRole('link', { name: '2 on hold' }).click();
		const list = page.getByRole('list', { name: 'Your matches, On hold' });
		await expect(list.locator(`a[href$="/matches/${HELD}"]`)).not.toContainText("doesn't count");
		await expect(list.locator(`a[href$="/matches/${HELD_VOUCHED}"]`)).toContainText(
			'Your team has vouched for it.'
		);
	});

	test('vouches for a held match through the dialog, and the hold ends', async ({ page }) => {
		await page
			.getByRole('list', { name: 'Needs you' })
			.locator(`a[href$="/matches/${HELD}"]`)
			.click();
		await expect(page).toHaveURL(new RegExp(`/matches/${HELD}$`));
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-held', 'true');
		await expect(panel.getByRole('heading', { name: 'On hold' })).toBeVisible();
		await expect(panel.getByText(/Another match has the same teams and date/)).toBeVisible();
		await expect(page.getByText(/moderator/i)).toHaveCount(0);

		await page.getByRole('button', { name: 'This match really happened' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Vouch for this match?' });
		await expect(dialog.getByText(/You can't undo a vouch/)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await dialog.getByRole('button', { name: 'Vouch for match' }).click();

		// Rosa's team and the other match had vouched, so hers was the last vouch.
		await expect(
			page.getByText('Vouched. The hold has ended and the match now counts.')
		).toBeVisible();
		// It is confirmed and no longer held, so the panel goes and the page title takes focus.
		await expect(panel).toHaveCount(0);
		await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
		await expect(page.getByRole('button', { name: 'This match really happened' })).toHaveCount(0);

		// Home: it left Needs you and the held count.
		await page.getByRole('link', { name: /^Home/ }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('list', { name: 'Needs you' }).locator(`a[href$="/matches/${HELD}"]`)
		).toHaveCount(0);
		await expect(page.getByTestId('in-progress')).toContainText('1 on hold');
	});

	test('says her team vouched already and offers nothing, from a link with nothing cached', async ({
		page
	}) => {
		await page.goto(`/matches/${HELD_VOUCHED}`);
		const panel = page.getByTestId('status-panel');
		await expect(panel.getByRole('heading', { name: 'On hold' })).toBeVisible();
		await expect(panel.getByText(/Your team vouched for this match/)).toBeVisible();
		await expect(actionButtons(panel)).toHaveCount(0);
	});

	test('has no WCAG 2.1 AA violations on home, a held match and the dialog, in either theme', async ({
		page
	}) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/');
			await expect(page.getByRole('list', { name: 'Needs you' })).toBeVisible();
			await expectNoAxeViolations(page);

			await page.goto(`/matches/${HELD}`);
			const vouch = page.getByRole('button', { name: 'This match really happened' });
			await expect(vouch).toBeVisible();
			await expectNoAxeViolations(page);

			await vouch.click();
			const dialog = page.getByRole('alertdialog', { name: 'Vouch for this match?' });
			await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
			// Axe reads colors mid fade-in otherwise.
			await page.waitForFunction(() =>
				document.getAnimations().every((animation) => animation.playState !== 'running')
			);
			await expectNoAxeViolations(page);
			await page.keyboard.press('Escape');
			await expect(vouch).toBeFocused();
		}
	});
});

test.describe('corrections', () => {
	test('corrects a pending match, opens the correction, and links the old match to it', async ({
		page
	}) => {
		await page.goto(`/matches/${WAITING_ON_ME_TOO}`);
		await page.getByRole('link', { name: 'Correct the score' }).click();
		await expect(page).toHaveURL(new RegExp(`/matches/${WAITING_ON_ME_TOO}/correct$`));
		await expect(page.getByRole('heading', { level: 1, name: 'Correct the score' })).toBeVisible();
		await expect(page.getByTestId('fixed-format')).toHaveText('Singles');
		await expect(page.getByText('Rosa Fenwick', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Remove Rosa/ })).toHaveCount(0);
		await expect(page.getByLabel("Game 3, your team's points")).toHaveValue('12');

		await page.getByLabel("Game 3, your team's points").fill('11');
		await page.getByLabel("Game 3, opponents' points").fill('8');
		await page.getByRole('button', { name: 'Save the correction' }).click();

		await expect(page.getByText('Correction saved', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/matches\/M-FXD/);
		const corrected = new URL(page.url()).pathname;
		const panel = page.getByTestId('status-panel');
		await expect(panel).toHaveAttribute('data-status', 'pending');
		await expect(panel.getByText(/You just corrected this match/)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();
		await expect(page.getByText('8-11, 11-6, 11-8')).toBeVisible();

		// Back to the old match within the visit: it is voided and links to the correction.
		await page.getByRole('link', { name: 'Matches', exact: true }).first().click();
		await rowFor(page, WAITING_ON_ME_TOO).first().click();
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'voided');
		await expect(page.getByRole('link', { name: 'See the corrected match' })).toHaveAttribute(
			'href',
			corrected
		);
	});

	test('corrects a disputed match, and the correction waits on the other team', async ({
		page
	}) => {
		await page.goto(`/matches/${MY_DISPUTE}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'disputed');
		await page.getByRole('link', { name: 'Correct the score' }).click();
		await page.getByLabel("Game 3, your team's points").fill('11');
		await page.getByLabel("Game 3, opponents' points").fill('9');
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await expect(page).toHaveURL(/\/matches\/M-FXD/);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'pending');

		// Home: the old match left the disputed count.
		await page.getByRole('link', { name: /^Home/ }).filter({ visible: true }).first().click();
		await expect(page.getByTestId('in-progress')).toContainText('3 disputed');
	});

	test('says the old match is voided when its correction page is opened again', async ({
		page
	}) => {
		await page.goto(`/matches/${WAITING_ON_ME_TOO}/correct`);
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await expect(page).toHaveURL(/\/matches\/M-FXD/);
		await page.goto(`/matches/${WAITING_ON_ME_TOO}/correct`);
		await expect(page.getByText(/was voided, so there is nothing to correct/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save the correction' })).toHaveCount(0);
	});

	test('shows a score the rules refuse on its field', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME_TOO}/correct`);
		await page.getByLabel("Game 1, your team's points").fill('11');
		await page.getByLabel("Game 1, opponents' points").fill('11');
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await expect(page.getByText(/to save this correction/)).toBeVisible();
		await expect(page.getByLabel("Game 1, your team's points")).toHaveAttribute(
			'aria-invalid',
			'true'
		);
	});

	test('the first click on Save works straight after editing a game score', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME_TOO}/correct`);
		await page.getByLabel("Game 1, your team's points").fill('11');
		await page.getByLabel("Game 1, opponents' points").fill('11');
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await expect(
			page.getByRole('alert').filter({ hasText: 'to save this correction' })
		).toBeFocused();
	});

	test('offers no correction on a confirmed match, or one with a private player', async ({
		page
	}) => {
		await page.goto(`/matches/${HELD_VOUCHED}`);
		await expect(page.getByTestId('status-panel')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Correct the score' })).toHaveCount(0);
		await page.goto(`/matches/${STILL_DISPUTED}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'disputed');
		await expect(page.getByRole('link', { name: 'Correct the score' })).toHaveCount(0);
	});

	test("names an event match's Event and Club, offers no correction, and says who settles it", async ({
		page
	}) => {
		await page.goto(`/matches/${EVENT_DISPUTE}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'disputed');
		const details = page.getByRole('region', { name: 'Details' });
		await expect(details.getByText('Larkspur Winter League', { exact: true })).toBeVisible();
		await expect(details.getByText('Juniper Court Club', { exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Correct the score' })).toHaveCount(0);
		await page.getByRole('button', { name: 'What does disputed mean?' }).click();
		await expect(
			page.getByRole('dialog', { name: 'What does disputed mean?' }).getByText(/organizer/)
		).toBeVisible();

		// Opened directly, the correction page says why instead of showing the form.
		await page.goto(`/matches/${EVENT_DISPUTE}/correct`);
		await expect(page.getByTestId('cannot-correct')).toContainText("event's organizer");
		await expect(page.getByRole('button', { name: 'Save the correction' })).toHaveCount(0);
	});

	test('names a Club-only match its Club, offers no correction, and leaves organizers out', async ({
		page
	}) => {
		await page.goto(`/matches/${CLUB_DISPUTE}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-status', 'disputed');
		const details = page.getByRole('region', { name: 'Details' });
		await expect(details.getByText('Marshwalk Racquet Club', { exact: true })).toBeVisible();
		await expect(details.getByText('Event', { exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Correct the score' })).toHaveCount(0);
		await page.getByRole('button', { name: 'What does disputed mean?' }).click();
		const popover = page.getByRole('dialog', { name: 'What does disputed mean?' });
		await expect(popover.getByText(/every player who disputed/)).toBeVisible();
		await expect(popover.getByText(/organizer/)).toHaveCount(0);

		await page.goto(`/matches/${CLUB_DISPUTE}/correct`);
		await expect(page.getByTestId('cannot-correct')).toContainText(
			"can't be corrected by its players"
		);
		// Already disputed, so it isn't told to dispute it.
		await expect(page.getByTestId('cannot-correct')).not.toContainText('dispute the match instead');
		await expect(page.getByRole('button', { name: 'Save the correction' })).toHaveCount(0);
	});

	// Details has two columns on a phone. A cell that sits alone in its line must fill it, or the
	// grid leaves an empty cell next to it. Pixel 7 is a phone width.
	test('leaves no empty cell in Details on a phone, with or without an Event or Club', async ({
		page
	}) => {
		for (const code of [EVENT_DISPUTE, CLUB_DISPUTE, WAITING_ON_ME]) {
			await page.goto(`/matches/${code}`);
			const list = page.getByRole('region', { name: 'Details' }).locator('dl');
			await expect(list.getByText('Match code', { exact: true })).toBeVisible();
			const lonely = await list.evaluate((dl) => {
				const width = dl.getBoundingClientRect().width;
				const cells = [...dl.children].map((cell) => cell.getBoundingClientRect());
				return cells.filter(
					(cell, index) =>
						Math.abs(cell.width - width) >= 1 &&
						!cells.some((other, i) => i !== index && Math.abs(other.top - cell.top) < 1)
				).length;
			});
			expect(lonely, `${code} has a cell alone in its line`).toBe(0);
		}
	});

	test('wraps a long Event or Club name inside Details on a phone', async ({ page }) => {
		await page.goto(`/matches/${EVENT_DISPUTE}`);
		const list = page.getByRole('region', { name: 'Details' }).locator('dl');
		await expect(list.getByText('Larkspur Winter League')).toBeVisible();
		// The fixture names are short, so the test lengthens them in place to one long word.
		const overflow = await list.evaluate((dl) => {
			const long = 'Northfenwickshireandoxleymeadowspickleballassociationwinterleague';
			for (const name of ['Larkspur Winter League', 'Juniper Court Club']) {
				const value = [...dl.querySelectorAll('dd')].find((dd) => dd.textContent === name)!;
				value.textContent = long;
			}
			return [...dl.querySelectorAll('dd'), dl].some((el) => el.scrollWidth > el.clientWidth);
		});
		expect(overflow).toBe(false);
	});

	test('has no WCAG 2.1 AA violations on a pending match and its correction, in either theme', async ({
		page
	}) => {
		for (const scheme of ['dark', 'light'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto(`/matches/${WAITING_ON_ME_TOO}`);
			await expect(page.getByRole('link', { name: 'Correct the score' })).toBeVisible();
			await expectNoAxeViolations(page);

			await page.goto(`/matches/${WAITING_ON_ME_TOO}/correct`);
			await expect(page.getByRole('button', { name: 'Save the correction' })).toBeVisible();
			await expectNoAxeViolations(page);

			await page.getByLabel("Game 1, opponents' points").fill('');
			await page.getByRole('button', { name: 'Save the correction' }).click();
			await expect(page.getByText(/to save this correction/)).toBeVisible();
			await page.waitForFunction(() =>
				document.getAnimations().every((animation) => animation.playState !== 'running')
			);
			await expectNoAxeViolations(page);
		}
	});
});

test.describe('match page status panel', () => {
	/** True when the status panel comes before the scoreboard in the page. */
	async function panelBeforeScore(page: Page): Promise<boolean> {
		const panel = page.getByTestId('status-panel');
		const board = page.getByRole('region', { name: 'Score', exact: true });
		await expect(panel).toBeVisible();
		await expect(board).toBeVisible();
		return panel.evaluate(
			(el, other) => !!(el.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING),
			await board.elementHandle()
		);
	}

	test('sits above the scoreboard when she has to confirm', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		await expect(page.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-tone', 'action');
		expect(await panelBeforeScore(page)).toBe(true);
	});

	test('sits above the scoreboard on a disputed match with nothing for her to do', async ({
		page
	}) => {
		await page.goto(`/matches/${STILL_DISPUTED}`);
		await expect(actionButtons(page.getByTestId('status-panel'))).toHaveCount(0);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-tone', 'disputed');
		expect(await panelBeforeScore(page)).toBe(true);
	});

	test('sits above the scoreboard on a held match, with the warning edge', async ({ page }) => {
		await page.goto(`/matches/${HELD_VOUCHED}`);
		await expect(page.getByTestId('status-panel')).toHaveAttribute('data-tone', 'held');
		expect(await panelBeforeScore(page)).toBe(true);
	});
});

test.describe('match page header', () => {
	test('is the format and date with the badge, and names the tab the same way', async ({
		page
	}) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const title = page.getByRole('heading', { level: 1 });
		await expect(title).toHaveText(/^(Singles|Doubles) · \w{3} \d{1,2} \w{3}$/);
		const [format, date] = (await title.innerText()).split(' · ');
		await expect(page).toHaveTitle(
			`${format}, ${date.split(' ').slice(1).join(' ')} · OPEN Pickleball`
		);
		await expect(title.locator('..')).not.toContainText(/ (beat|lost to) /);
	});

	test('copies the match code from Details', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const details = page.getByRole('region', { name: 'Details' });
		await expect(details.getByText(WAITING_ON_ME, { exact: true })).toBeVisible();
		await details.getByRole('button', { name: 'Copy match code' }).click();
		await expect(page.getByText('Match code copied')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(WAITING_ON_ME);
	});

	test('shows names on the scoreboard with no player codes, and says the result to screen readers', async ({
		page
	}) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const score = page.getByRole('region', { name: 'Score', exact: true });
		await expect(score.getByText(`${tamsin.displayName} (you)`, { exact: true })).toBeVisible();
		await expect(score.getByText(/^P-/)).toHaveCount(0);
		await expect(score.getByTestId('scoreboard-result')).toHaveText(
			/^You and .+ (beat|lost to) .+, \d+-\d+(, \d+-\d+)*\.$/
		);
	});
});

test.describe('match page back link', () => {
	/** The back link above the match page's title. */
	function backLink(page: Page, name: 'Home' | 'Matches') {
		return page.locator('#main').getByRole('link', { name, exact: true });
	}

	function needsYouRow(page: Page, code: string) {
		return page.getByRole('list', { name: 'Needs you' }).locator(`a[href$="/matches/${code}"]`);
	}

	test('returns to Home from the Needs you list, by going back in history', async ({ page }) => {
		await needsYouRow(page, WAITING_ON_ME).click();
		await expect(page).toHaveURL(new RegExp(`/matches/${WAITING_ON_ME}$`));
		const back = backLink(page, 'Home');
		await expect(back).toHaveAttribute('href', '/');

		const entries = await page.evaluate(() => history.length);
		await back.click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('list', { name: 'Needs you' })).toBeVisible();
		// Back in history, not a new entry.
		expect(await page.evaluate(() => history.length)).toBe(entries);

		// Forward to the match again: the link still says Home.
		await page.goForward();
		await expect(backLink(page, 'Home')).toHaveAttribute('href', '/');
	});

	test('returns to Matches with its filter', async ({ page }) => {
		await page.goto('/matches?show=disputed');
		await rowFor(page, STILL_DISPUTED).click();
		const back = backLink(page, 'Matches');
		await expect(back).toHaveAttribute('href', '/matches?show=disputed');
		await back.click();
		await expect(page).toHaveURL(/\/matches\?show=disputed$/);
		await expect(pill(page, 'Disputed')).toBeChecked();
	});

	test('returns to the page of Matches it came from', async ({ page }) => {
		await page.goto('/matches?page=2');
		await expect(page.getByTestId('range')).toHaveText('21–28 of 28');
		await rowFor(page, matchCode(oldest.random)).click();
		const back = backLink(page, 'Matches');
		await expect(back).toHaveAttribute('href', '/matches?page=2');
		const entries = await page.evaluate(() => history.length);
		await back.click();
		await expect(page).toHaveURL(/\/matches\?page=2$/);
		await expect(page.getByTestId('range')).toHaveText('21–28 of 28');
		expect(await page.evaluate(() => history.length)).toBe(entries);
	});

	test('opens its address in a new tab with a modifier click', async ({ page, context }) => {
		await page.goto('/matches?show=disputed');
		await rowFor(page, STILL_DISPUTED).click();
		const [tab] = await Promise.all([
			context.waitForEvent('page'),
			backLink(page, 'Matches').click({ modifiers: ['ControlOrMeta'] })
		]);
		await expect(tab).toHaveURL(/\/matches\?show=disputed$/);
		// The match stays open in the first tab.
		await expect(page).toHaveURL(new RegExp(`/matches/${STILL_DISPUTED}$`));
	});

	test('goes to Matches from a shared link', async ({ page }) => {
		await page.goto(`/matches/${WAITING_ON_ME}`);
		const back = backLink(page, 'Matches');
		await expect(back).toHaveAttribute('href', '/matches');
		await back.click();
		await expect(page).toHaveURL(/\/matches$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Matches' })).toBeVisible();
	});

	test('keeps Home after a correction, without going back to the form', async ({ page }) => {
		await needsYouRow(page, WAITING_ON_ME_TOO).click();
		await expect(backLink(page, 'Home')).toBeVisible();
		await page.getByRole('link', { name: 'Correct the score' }).click();

		// The correction page goes back to the match, and the match still goes back to Home.
		const toMatch = page.locator('#main').getByRole('link', { name: 'Back to the match' });
		await expect(toMatch).toHaveAttribute('href', `/matches/${WAITING_ON_ME_TOO}`);
		await toMatch.click();
		await expect(page).toHaveURL(new RegExp(`/matches/${WAITING_ON_ME_TOO}$`));
		await expect(backLink(page, 'Home')).toHaveAttribute('href', '/');

		await page.getByRole('link', { name: 'Correct the score' }).click();
		await page.getByLabel("Game 3, your team's points").fill('11');
		await page.getByLabel("Game 3, opponents' points").fill('8');
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await expect(page.getByText('Correction saved', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/matches\/M-FXD/);

		const back = backLink(page, 'Home');
		await expect(back).toHaveAttribute('href', '/');
		await back.click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('list', { name: 'Needs you' })).toBeVisible();
	});
});
