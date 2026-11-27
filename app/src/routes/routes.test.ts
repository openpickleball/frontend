import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import { ROUTES, buildCode } from '#lib/domain/index.js';
import appHtml from '../app.html?raw';
import themeScript from '../../static/theme.js?raw';

// Every route page, keyed by its path under src/routes.
const pages = import.meta.glob<{ default: Component }>('./**/+page.svelte', { eager: true });

const expected: Record<string, string> = {
	'./+page.svelte': 'Home',
	'./record/+page.svelte': 'Record a match',
	'./matches/+page.svelte': 'Matches',
	'./matches/[code]/+page.svelte': 'Match',
	'./matches/[code]/correct/+page.svelte': 'Correct the score',
	'./profile/+page.svelte': 'Profile',
	'./profile/ratings/+page.svelte': 'Rating history',
	'./account/login/+page.svelte': 'Sign in',
	'./account/signup/+page.svelte': 'Create account',
	'./account/verify-email/[key]/+page.svelte': 'Verify your email',
	'./account/password/reset/+page.svelte': 'Reset your password',
	'./account/password/reset/key/[key]/+page.svelte': 'Choose a new password'
};

// Real props for each page, as SvelteKit passes them. The match pages need their load data.
const MATCH_CODE = buildCode('match', '7QK2H9WD3NF');
const propsFor = (path: string): Record<string, unknown> => {
	if (path === './matches/+page.svelte') return { data: { page: 1 } };
	if (
		path === './matches/[code]/+page.svelte' ||
		path === './matches/[code]/correct/+page.svelte'
	) {
		return { params: { code: MATCH_CODE } };
	}
	return { params: { key: 'example-key' } };
};

describe('route pages', () => {
	it('covers every route the shell links to', () => {
		expect(Object.keys(pages).sort()).toEqual(Object.keys(expected).sort());
	});

	it('has a page for every path in ROUTES', () => {
		// `account` is a layout, not a page, so it has no +page.svelte of its own.
		const { account, ...pagePaths } = ROUTES;
		expect(account).toBe('/account');
		for (const path of Object.values(pagePaths)) {
			const file = path === '/' ? './+page.svelte' : `.${path}/+page.svelte`;
			expect(Object.keys(pages), path).toContain(file);
		}
	});

	for (const [path, heading] of Object.entries(expected)) {
		it(`${path} has one h1 and a title`, () => {
			const { body, head } = render(pages[path].default, { props: propsFor(path) });
			expect(body.match(/<h1[\s>]/g)).toHaveLength(1);
			// A heading from a component (CardTitle) carries Svelte's empty comment markers.
			const text = body.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1].replace(/<!--[^>]*-->/g, '');
			expect(text).toBe(heading);
			expect(head).toMatch(/<title>[^<]*OPEN Pickleball<\/title>/);
		});
	}

	it('puts the page number in the matches title, and no code in the match title', () => {
		const history = render(pages['./matches/+page.svelte'].default, {
			props: propsFor('./matches/+page.svelte')
		});
		expect(history.head).toContain('<title>Matches, page 1 · OPEN Pickleball</title>');
		const detail = render(pages['./matches/[code]/+page.svelte'].default, {
			props: propsFor('./matches/[code]/+page.svelte')
		});
		// The match isn't loaded yet. Once it is, the title is its format and date.
		expect(detail.head).toContain('<title>Match · OPEN Pickleball</title>');
		expect(detail.head).not.toContain(MATCH_CODE);
	});

	it('keeps copy plain: no em dashes in any page', () => {
		for (const [path, page] of Object.entries(pages)) {
			const { body, head } = render(page.default, { props: propsFor(path) });
			expect(body + head, path).not.toContain('\u2014');
		}
	});
});

describe('app.html', () => {
	it('has theme-color metas for both color schemes', () => {
		expect(appHtml).toContain(
			'<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />'
		);
		expect(appHtml).toContain(
			'<meta name="theme-color" content="#f7f3e8" media="(prefers-color-scheme: light)" />'
		);
	});

	it('keeps the body classes from the theme work', () => {
		expect(appHtml).toContain('class="bg-primary font-body text-secondary antialiased"');
	});

	// The content security policy (src/csp.ts) hashes only SvelteKit's own inline script, so
	// app.html must not add one.
	it('has no inline script', () => {
		expect(appHtml).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
	});

	// After %sveltekit.head%, which holds the CSP meta tag, so the policy covers it. Still a
	// blocking script in the head, so it runs before first paint.
	it('loads the theme script as a blocking file in the head, after the SvelteKit head', () => {
		const tag = '<script src="/theme.js"></script>';
		expect(appHtml).toContain(tag);
		expect(appHtml.indexOf(tag)).toBeGreaterThan(appHtml.indexOf('%sveltekit.head%'));
		expect(appHtml.indexOf(tag)).toBeLessThan(appHtml.indexOf('</head>'));
	});

	describe('no-flash theme script (static/theme.js)', () => {
		// Runs the script against stand-ins for the document and localStorage.
		function run(stored: string | null | 'throws') {
			const script = themeScript;
			const metas = [{ content: '#000000' }, { content: '#f7f3e8' }];
			const documentElement = { dataset: {} as { theme?: string } };
			const document = { documentElement, querySelectorAll: () => metas };
			const localStorage = {
				getItem: () => {
					if (stored === 'throws') throw new Error('blocked');
					return stored;
				}
			};
			new Function('document', 'localStorage', script)(document, localStorage);
			return { theme: documentElement.dataset.theme, metas: metas.map((m) => m.content) };
		}

		it('applies a stored light choice to <html> and the metas', () => {
			expect(run('light')).toEqual({ theme: 'light', metas: ['#f7f3e8', '#f7f3e8'] });
		});

		it('applies a stored dark choice to <html> and the metas', () => {
			expect(run('dark')).toEqual({ theme: 'dark', metas: ['#000000', '#000000'] });
		});

		it('leaves the system setting in charge when nothing valid is stored', () => {
			for (const stored of [null, 'sepia']) {
				expect(run(stored)).toEqual({ theme: undefined, metas: ['#000000', '#f7f3e8'] });
			}
		});

		it('survives blocked storage', () => {
			expect(run('throws').theme).toBeUndefined();
		});
	});
});
