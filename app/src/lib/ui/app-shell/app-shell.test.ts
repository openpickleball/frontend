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

	it('shows the top bar and tab bar on mobile and the side nav from 960px', () => {
		const body = shell('/');
		expect(body).toMatch(/<header[^>]*shell:hidden/);
		expect(body).toMatch(/<nav[^>]*fixed[^>]*shell:hidden/);
		expect(body).toMatch(/<div[^>]*hidden[^>]*shell:flex/);
	});

	it('puts the page in one main landmark, with a skip link to it', () => {
		const body = shell('/');
		expect(body).toContain('href="#main"');
		expect(body.match(/<main[\s>]/g)).toHaveLength(1);
		expect(body).toMatch(/<main[^>]*id="main"[^>]*>\s*<h1>Stub<\/h1>/);
	});

	it('has no extra landmark besides the Main navs, the header and main', () => {
		expect(shell('/')).not.toContain('<aside');
	});

	it('clears landscape notches on the top bar and main', () => {
		const body = shell('/');
		for (const side of ['left', 'right']) {
			expect(
				body.match(
					new RegExp(`max\\(var\\(--spacing-gutter\\),env\\(safe-area-inset-${side}\\)\\)`, 'g')
				)
			).toHaveLength(2);
		}
	});

	it('has a theme toggle in the top bar and in the side nav', () => {
		const body = shell('/');
		expect(body.match(/aria-label="Switch to (light|dark) theme"/g)).toHaveLength(2);
	});
});
