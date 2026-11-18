import { expect, test } from '@playwright/test';
import { signIn } from '../e2e/helpers';

// The live happy path: sign in, record a singles match, see it wait for the other team, and find
// it in the matches list. It talks to the real local backend (see "Live happy path" in
// app/README.md). It skips, with the reason, when the backend or the settings are missing.
//
// It adds one pending match to the local database on every run.

const API = 'http://127.0.0.1:8000';
const MATCH_URL = /\/matches\/(M-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})$/;

const email = process.env.LIVE_EMAIL;
const password = process.env.LIVE_PASSWORD;
const opponent = process.env.LIVE_OPPONENT_CODE;
// Only needed until the backend shows a player their own code (backend#124).
const ownCode = process.env.LIVE_OWN_CODE;

// The list reporter does not print a skip reason, so say it on the console too.
function skip(reason: string): never {
	console.warn(`e2e:live skipped. ${reason}`);
	test.skip(true, reason);
	throw new Error(reason);
}

test('signs in, records a singles match and sees it in the list', async ({ page }) => {
	const missing = [
		['LIVE_EMAIL', email],
		['LIVE_PASSWORD', password],
		['LIVE_OPPONENT_CODE', opponent]
	]
		.filter(([, value]) => !value)
		.map(([name]) => name);
	if (missing.length > 0) {
		skip(`Set ${missing.join(', ')}. See "Live happy path" in app/README.md.`);
	}

	const reachable = await fetch(`${API}/api/v1/health/live`)
		.then((response) => response.ok)
		.catch(() => false);
	if (!reachable) skip(`The backend is not answering at ${API}. See app/README.md.`);

	await signIn(page, email!, password!);
	await page.goto('/record');

	// Until backend#124, the app asks for the player's own code once.
	const chip = page.getByTestId('chip');
	const prompt = page.getByRole('heading', { name: 'Enter your OPEN code' });
	await expect(chip.or(prompt)).toBeVisible();
	if (await prompt.isVisible()) {
		expect(ownCode, 'The app asks for your own code. Set LIVE_OWN_CODE.').toBeTruthy();
		await page.getByRole('textbox', { name: 'Your OPEN code' }).fill(ownCode!);
		await page.getByRole('button', { name: 'Save code' }).click();
	}
	await expect(chip).toBeVisible();

	await page.getByText('Singles', { exact: true }).click();
	const field = page.getByLabel("Your opponent's OPEN code");
	await field.fill(opponent!);
	await field.blur();
	// The backend refuses a match that repeats one from the same day. Three games, each won 11 to
	// 0-9, give 1000 score lines, picked from the time of day, so a line repeats only after
	// 1000 seconds and runs less than 1000 seconds apart never collide.
	const now = new Date();
	const tick = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) % 1000;
	const losers = String(tick).padStart(3, '0').split('');
	for (const [index, loser] of losers.entries()) {
		const game = index + 1;
		if (game > 1) await page.getByRole('button', { name: 'Add a game' }).click();
		await page.getByLabel(`Game ${game}, your team's points`).fill('11');
		await page.getByLabel(`Game ${game}, opponents' points`).fill(loser);
	}
	await page.getByRole('button', { name: 'Record and confirm score' }).click();

	await expect(page).toHaveURL(MATCH_URL);
	const code = MATCH_URL.exec(page.url())![1];
	await expect(page.getByRole('heading', { name: 'Waiting for the other team' })).toBeVisible();

	await page.goto('/matches');
	await expect(page.locator(`a[href$="/matches/${code}"]`)).toBeVisible();
});
