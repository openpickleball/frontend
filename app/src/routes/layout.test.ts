import { describe, expect, it } from 'vitest';
import { compile } from 'tailwindcss';
import layoutCss from './layout.css?raw';
import tailwindIndexCss from 'tailwindcss/index.css?raw';
import { THEME_COLORS } from '#lib/ui/theme-toggle/theme.js';
import appHtml from '../app.html?raw';
import themeScript from '../../static/theme.js?raw';

// Vite lists the files that exist, so the test needs no file system access.
// Glob keys are relative to this file and url() values to layout.css, so both must share a folder.
const assetFiles = import.meta.glob('../lib/assets/**/*', { query: '?url', eager: true });

const candidates = [
	'bg-primary',
	'text-secondary',
	'text-muted',
	'border-line',
	'text-faint',
	'bg-surface',
	'px-gutter',
	'font-display',
	'font-body',
	'bg-surface',
	'text-confirmed',
	'text-disputed',
	'text-danger',
	'text-pending',
	'text-voided',
	'border-field',
	'bg-confirmed-wash',
	'bg-danger-wash',
	'lg:hidden',
	'light:hidden',
	'mark',
	'label',
	'page-title'
];

const tokens: Record<string, string> = {
	'--color-primary': 'light-dark(#f7f3e8, #000000)',
	'--color-secondary': 'light-dark(#17150f, #ffffff)',
	'--color-muted': 'light-dark(#4d493f, #bdbdbd)',
	'--color-line': 'light-dark(#d8d1bf, #3d3d3d)',
	'--color-faint': 'light-dark(#6c6658, #8a8a8a)',
	'--color-surface': 'light-dark(#fcfaf3, #0d0d0d)',
	'--spacing-gutter': 'clamp(20px, 4vw, 56px)',
	'--font-display': '"Krona One", sans-serif',
	'--font-body': '"Instrument Sans", sans-serif'
};

// Additions for the app (plans/frontend-v1/mockups/README.md, "Token additions").
const appTokens: Record<string, string> = {
	'--color-confirmed': 'light-dark(#3b5c12, #bad446)',
	'--color-disputed': 'light-dark(#a3301b, #ff8b73)',
	'--color-danger': 'light-dark(#a3301b, #ff8b73)',
	'--color-pending': 'var(--color-muted)',
	'--color-voided': 'var(--color-faint)',
	'--color-field': 'var(--color-faint)',
	'--color-confirmed-wash': 'light-dark(#e9ecd2, #141a06)',
	'--color-danger-wash': 'light-dark(#f6e2d9, #1f0d09)',
	'--header-height': '64px',
	'--tabbar-height': '64px'
};

const utilities: [selector: string, declaration: string][] = [
	['.bg-primary', 'background-color: var(--color-primary)'],
	['.text-secondary', 'color: var(--color-secondary)'],
	['.text-muted', 'color: var(--color-muted)'],
	['.border-line', 'border-color: var(--color-line)'],
	['.text-faint', 'color: var(--color-faint)'],
	['.bg-surface', 'background-color: var(--color-surface)'],
	['.px-gutter', 'padding-inline: var(--spacing-gutter)'],
	['.font-display', 'font-family: var(--font-display)'],
	['.font-body', 'font-family: var(--font-body)'],
	['.text-confirmed', 'color: var(--color-confirmed)'],
	['.text-disputed', 'color: var(--color-disputed)'],
	['.text-danger', 'color: var(--color-danger)'],
	['.text-pending', 'color: var(--color-pending)'],
	['.text-voided', 'color: var(--color-voided)'],
	['.border-field', 'border-color: var(--color-field)'],
	['.bg-confirmed-wash', 'background-color: var(--color-confirmed-wash)'],
	['.bg-danger-wash', 'background-color: var(--color-danger-wash)']
];

async function buildLayoutCss(): Promise<string> {
	const compiler = await compile(layoutCss, {
		base: '/',
		loadStylesheet: async (id: string, base: string) => {
			if (id !== 'tailwindcss') throw new Error(`Unexpected stylesheet import: ${id}`);
			return { path: 'tailwindcss/index.css', base, content: tailwindIndexCss };
		}
	});
	// Prettier writes CSS strings with single quotes. CSS treats both quote styles the same, so
	// compare with double quotes, as the teaser writes them.
	return compiler.build(candidates).replaceAll("'", '"');
}

/** The contents of the first `@layer base { ... }` block, matching nested braces. */
function baseLayer(css: string): string | undefined {
	const start = css.indexOf('@layer base {');
	if (start === -1) return undefined;
	const open = css.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		if (css[i] === '{') depth++;
		if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
	}
	return undefined;
}

/** The body of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string | undefined {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

describe('layout.css', () => {
	it('emits the teaser theme tokens, utilities, base rules and font faces', async () => {
		const css = await buildLayoutCss();

		for (const [name, value] of Object.entries(tokens)) {
			expect(css).toContain(`${name}: ${value};`);
		}
		for (const [name, value] of Object.entries(appTokens)) {
			expect(css).toContain(`${name}: ${value};`);
		}
		for (const [selector, declaration] of utilities) {
			expect(ruleBody(css, selector), selector).toContain(declaration);
		}
		expect(ruleBody(css, ':root')).toContain('color-scheme: light dark;');
		expect(ruleBody(css, ':root[data-theme="light"]')).toContain('color-scheme: light;');
		expect(ruleBody(css, ':root[data-theme="dark"]')).toContain('color-scheme: dark;');

		const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
		const krona = fontFaces.find((rule) => rule.includes('font-family: "Krona One"'));
		const instrument = fontFaces.find((rule) => rule.includes('font-family: "Instrument Sans"'));
		expect(krona).toContain('src: url("../lib/assets/fonts/krona-one-latin.woff2")');
		expect(krona).toContain('font-weight: 400;');
		expect(krona).toContain('font-style: normal;');
		expect(krona).toContain('font-display: swap;');
		expect(instrument).toContain('src: url("../lib/assets/fonts/instrument-sans-latin-var.woff2")');
		expect(instrument).toContain('font-weight: 400 700;');
		expect(instrument).toContain('font-style: normal;');
		expect(instrument).toContain('font-display: swap;');
	});

	it('keeps the color-scheme rules inside @layer base', () => {
		const base = baseLayer(layoutCss.replaceAll("'", '"'));
		expect(base, '@layer base block in layout.css').toBeDefined();
		expect(ruleBody(base ?? '', ':root')).toContain('color-scheme: light dark;');
		expect(ruleBody(base ?? '', ':root[data-theme="light"]')).toContain('color-scheme: light;');
		expect(ruleBody(base ?? '', ':root[data-theme="dark"]')).toContain('color-scheme: dark;');
	});

	it('switches to the side nav at 1024px', async () => {
		const css = await buildLayoutCss();
		expect(css).toMatch(/@media \(width >= 64rem\)\s*\{[^@]*\.lg\\:hidden/);
	});

	it('has a light: variant that follows data-theme, then the system setting', async () => {
		const css = await buildLayoutCss();
		// The stored choice: data-theme="light" on the root or an ancestor.
		expect(css).toContain(':where([data-theme="light"], [data-theme="light"] *)');
		// No stored choice: the system setting, unless the root says dark.
		expect(css).toContain('@media (prefers-color-scheme: light)');
		expect(css).toContain(
			':where(:root:not([data-theme="dark"]), :root:not([data-theme="dark"]) *)'
		);
		expect(css).toContain('.light\\:hidden');
	});

	it('points every url() at an asset that exists', () => {
		const urls = [...layoutCss.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
		expect(urls).toEqual(
			expect.arrayContaining([
				'../lib/assets/fonts/krona-one-latin.woff2',
				'../lib/assets/fonts/instrument-sans-latin-var.woff2',
				'../lib/assets/mark.svg'
			])
		);
		for (const url of urls) {
			expect(Object.keys(assetFiles), url).toContain(url);
		}
	});
});

// The browser chrome color is written in the tokens, in THEME_COLORS, in app.html and in
// static/theme.js. Each must
// follow `--color-primary`, so a change to the token cannot leave the chrome on the old color.
describe('theme colors', () => {
	it('THEME_COLORS follow --color-primary', () => {
		const token = /--color-primary:\s*light-dark\(\s*(#\w+)\s*,\s*(#\w+)\s*\)/.exec(layoutCss);
		expect(token).not.toBeNull();
		expect(THEME_COLORS).toEqual({ light: token?.[1], dark: token?.[2] });
	});

	it('app.html and static/theme.js write the same colors', () => {
		const tag =
			/<meta name="theme-color" content="(#\w+)" media="\(prefers-color-scheme: (\w+)\)"/g;
		const metas = Object.fromEntries([...appHtml.matchAll(tag)].map((m) => [m[2], m[1]]));
		expect(metas).toEqual(THEME_COLORS);
		const script = /theme === 'light' \? '(#\w+)' : '(#\w+)'/.exec(themeScript);
		expect(script?.slice(1)).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
	});
});
