import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import AppShell from './app-shell.svelte';
import { NAV_ITEMS, isCurrent } from './nav.js';

const children = createRawSnippet(() => ({ render: () => '<h1>Stub</h1>' }));

function shell(pathname: string) {
	return render(AppShell, { props: { pathname, children } }).body;
}

/** The markup of the nav landmark that starts at the nth `<nav`. */
function navs(body: string): string[] {
	return body.match(/<nav[\s\S]*?<\/nav>/g) ?? [];
}

describe('isCurrent', () => {
	const [home, record, matches, profile] = NAV_ITEMS;

	it('matches Home only on /', () => {
		expect(isCurrent(home, '/')).toBe(true);
		expect(isCurrent(home, '/record')).toBe(false);
	});

	it('matches a page and the pages under it', () => {
		expect(isCurrent(matches, '/matches')).toBe(true);
		expect(isCurrent(matches, '/matches/M-7QK2-H9WD-3NFA')).toBe(true);
		expect(isCurrent(record, '/matches')).toBe(false);
		expect(isCurrent(profile, '/profiles')).toBe(false);
	});

	it('matches nothing on account pages', () => {
		for (const item of NAV_ITEMS) expect(isCurrent(item, '/account/login')).toBe(false);
	});
});

describe('AppShell', () => {
	it('lists Home, Record, Matches and Profile in the tab bar and the side nav', () => {
		const [side, tabs] = [shell('/')].flatMap(navs);
		for (const nav of [side, tabs]) {
			const hrefs = [...nav.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
			expect(hrefs).toEqual(['/', '/record', '/matches', '/profile']);
		}
		expect(tabs).toMatch(/\sHome<\/a>/);
		expect(tabs).toMatch(/\sRecord<\/a>/);
		expect(tabs).toMatch(/\sMatches<\/a>/);
		expect(tabs).toMatch(/\sProfile<\/a>/);
		expect(side).toContain('Record a match');
	});

	it('drops the navs for account pages (bare) and keeps the top bar at every width', () => {
		const body = render(AppShell, {
			props: { pathname: '/account/login', children, bare: true }
		}).body;
		expect(navs(body)).toHaveLength(0);
		expect(body).toMatch(/<header/);
		expect(body).not.toMatch(/<header[^>]*lg:hidden/);
		expect(body.match(/<main[\s>]/g)).toHaveLength(1);
	});

	it('shows account actions (sign out) in the side nav only, once', () => {
		const account = createRawSnippet(() => ({ render: () => '<button>Sign out</button>' }));
		const body = render(AppShell, { props: { pathname: '/', children, account } }).body;
		expect(body.match(/<button>Sign out<\/button>/g)).toHaveLength(1);
		expect(body.slice(body.indexOf('<header'), body.indexOf('</header>'))).toContain('Sign out');
		expect(shell('/')).not.toContain('Sign out');
	});

	it('names both navs "Main"', () => {
		const found = navs(shell('/'));
		expect(found).toHaveLength(2);
		for (const nav of found) expect(nav).toContain('aria-label="Main"');
	});

	it('marks the current page with aria-current in both navs', () => {
		for (const nav of navs(shell('/matches/M-7QK2-H9WD-3NFA'))) {
			expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
			expect(nav).toMatch(
				/href="\/matches"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/matches"/
			);
		}
		for (const nav of navs(shell('/account/login'))) {
			expect(nav).not.toContain('aria-current');
		}
	});

	it('shows the top bar and tab bar on mobile and the side nav from 1024px', () => {
		const body = shell('/');
		expect(body).toMatch(/<header[^>]*lg:hidden/);
		expect(body).toMatch(/<nav[^>]*fixed[^>]*lg:hidden/);
		expect(body).toMatch(/<header[^>]*hidden[^>]*lg:flex/);
	});

	it('puts the page in one main landmark, with a skip link to it', () => {
		const body = shell('/');
		expect(body).toContain('href="#main"');
		expect(body.match(/<main[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<main[^>]*id="main"[^>]*>\s*<h1>Stub<\/h1>/);
	});

	it('puts the side nav, its sign out and its theme toggle inside a banner landmark', () => {
		const body = shell('/');
		const side = body.match(/<header[^>]*lg:flex[\s\S]*?<\/header>/)![0];
		expect(side).toContain('<nav');
		expect(side).toContain('aria-label="Switch to');
		expect(body).not.toContain('<aside');
	});

	it('clears landscape notches on the top bar, main and footer', () => {
		const body = shell('/');
		for (const side of ['left', 'right']) {
			expect(
				body.match(
					new RegExp(`max\\(var\\(--spacing-gutter\\),env\\(safe-area-inset-${side}\\)\\)`, 'g')
				)
			).toHaveLength(3);
		}
	});

	it('ends every page with a footer that links to the source code in a new tab', () => {
		for (const body of [
			shell('/'),
			render(AppShell, { props: { pathname: '/account/login', children, bare: true } }).body
		]) {
			expect(body.match(/<footer[\s>]/g)).toHaveLength(1);
			const footer = body.match(/<footer[\s\S]*?<\/footer>/)![0];
			expect(footer).toContain('AGPL-3.0-or-later');
			expect(footer).toMatch(/href="https:\/\/github\.com\/openpickleball\/frontend"/);
			expect(footer).toContain('target="_blank"');
			expect(footer).toContain('rel="noopener"');
			expect(footer).toContain('(opens in a new tab)');
			expect(body.indexOf('</main>')).toBeLessThan(body.indexOf('<footer'));
		}
	});

	it('has a theme toggle in the top bar and in the side nav', () => {
		const body = shell('/');
		expect(body.match(/aria-label="Switch to (ivory|black) theme"/g)).toHaveLength(2);
	});
});
