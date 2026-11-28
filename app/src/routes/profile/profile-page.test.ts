import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { APP_COMMIT, APP_VERSION, versionLabel } from '#lib/ui/app-version.js';
import { PRIVACY_URL, TERMS_URL } from '#lib/ui/legal.js';
import ProfilePage from './+page.svelte';
import DataPage from './data/+page.svelte';
import PrivacyPage from './privacy/+page.svelte';

/** The visible text of some rendered HTML: the text between its tags, joined by spaces. */
const textOf = (html: string) =>
	[...`>${html}<`.matchAll(/>([^<]*)</g)]
		.map((m) => m[1].trim())
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/g, ' ');

function renderSignedIn() {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	return render(ProfilePage).body;
}

afterEach(() => {
	session.reset();
	myCode.reset();
});

/** myCode as the gate leaves it once the backend sent the player's code and name. */
function readyCode(displayName: string) {
	myCode.code = buildCode('player', '4RWN8TQ') as PlayerCode;
	myCode.displayName = displayName;
	myCode.status = 'ready';
}

describe('the profile page', () => {
	it('has the settings groups in order, then Sign out', () => {
		const body = renderSignedIn();
		const titles = [...body.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => textOf(m[1]));
		expect(titles).toEqual(['Account', 'Privacy', 'Your data', 'Help and about']);
		expect(body.lastIndexOf('Sign out')).toBeGreaterThan(body.indexOf('App version'));
	});

	it('links each settings row to its page', () => {
		const body = renderSignedIn();
		for (const [href, title] of [
			['/profile/two-factor', 'Two-factor authentication'],
			['/profile/privacy', 'Profile visibility'],
			['/profile/data', 'Copy of your data']
		]) {
			const link = body.match(new RegExp(`<a href="${href}"[^>]*>(.*?)</a>`, 's'));
			expect(link, href).not.toBeNull();
			expect(textOf(link![1])).toContain(title);
			expect(link![0]).not.toContain('target=');
		}
	});

	it('shows the name other players see as text, with no link or field, first in Account', () => {
		readyCode('Tamsin V.');
		const body = renderSignedIn();
		const row = body.match(/<li[^>]*data-testid="profile-name"[^>]*>(.*?)<\/li>/s);
		expect(row).not.toBeNull();
		expect(textOf(row![1])).toBe("Name Tamsin V. From your sign-up. It can't be changed.");
		expect(row![1]).not.toMatch(/<a\b|<input\b|<button\b/);
		expect(body.indexOf('data-testid="profile-name"')).toBeLessThan(
			body.indexOf('href="/profile/two-factor"')
		);
		expect(textOf(body)).not.toContain('Display name');
	});

	it('shows no Name row while the name is not known', () => {
		expect(renderSignedIn()).not.toContain('data-testid="profile-name"');
	});

	it('opens the terms and the privacy policy in a new tab, as the footer does', () => {
		const body = renderSignedIn();
		for (const [href, title] of [
			[TERMS_URL, 'Terms of Service'],
			[PRIVACY_URL, 'Privacy Policy']
		]) {
			const link = body.match(new RegExp(`<a href="${href}"[^>]*>(.*?)</a>`, 's'));
			expect(link, href).not.toBeNull();
			expect(link![0]).toContain('target="_blank"');
			expect(link![0]).toContain('rel="noopener"');
			expect(textOf(link![1])).toBe(`${title} (opens in a new tab)`);
		}
	});

	it('has a Send feedback row that opens a dialog', () => {
		const body = renderSignedIn();
		const button = body.match(/<button[^>]*>(?:(?!<\/button>).)*Send feedback.*?<\/button>/s);
		expect(button).not.toBeNull();
		expect(button![0]).toContain('aria-haspopup="dialog"');
	});

	it('shows the app version and commit from the build', () => {
		const body = renderSignedIn();
		const version = body.match(/data-testid="app-version"[^>]*>(.*?)<\/span>/s);
		expect(textOf(version![1])).toBe(versionLabel(APP_VERSION, APP_COMMIT));
	});

	it('says whether two-factor is on, and nothing while it is unknown', () => {
		const row = (body: string) =>
			textOf(body.match(/<a href="\/profile\/two-factor"[^>]*>(.*?)<\/a>/s)![1]);
		expect(row(renderSignedIn())).toBe('Two-factor authentication');
		session.mfaEnrolled = true;
		expect(row(render(ProfilePage).body)).toBe('Two-factor authentication On');
		session.mfaEnrolled = false;
		expect(row(render(ProfilePage).body)).toBe('Two-factor authentication Off');
	});

	it('shows no rows for settings that do not exist yet, and no numbers', () => {
		const text = textOf(renderSignedIn());
		expect(text).not.toMatch(/coming soon|password|leaderboard|connected apps|delete/i);
		expect(text).not.toMatch(/rating|stats|matches/i);
	});

	it('shows no settings to a signed-out visitor', () => {
		const body = render(ProfilePage).body;
		expect(body).not.toContain('<h2');
		expect(body).not.toContain('Sign out');
	});
});

describe('the settings pages under Profile', () => {
	it.each([
		['Profile visibility', PrivacyPage],
		['Copy of your data', DataPage]
	])('%s has a back link to Profile above its title', (title, page) => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const body = render(page).body;
		const back = body.search(/<a[^>]*href="\/profile"/);
		expect(back).toBeGreaterThan(-1);
		expect(back).toBeLessThan(body.indexOf('<h1'));
		expect(textOf(body.match(/<h1[^>]*>(.*?)<\/h1>/s)![1])).toBe(title);
	});

	it('Copy of your data says how to ask for a copy', () => {
		const body = render(DataPage).body;
		expect(body).toContain('href="mailto:info@openpb.org"');
		expect(textOf(body)).toContain('You can always get a copy of your data.');
	});
});
