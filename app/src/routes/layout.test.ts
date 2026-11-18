import { describe, expect, it } from 'vitest';
import { compile } from 'tailwindcss';
import layoutCss from './layout.css?raw';
import tailwindIndexCss from 'tailwindcss/index.css?raw';

// Vite lists the files that exist, so the test needs no file system access.
const fontFiles = import.meta.glob('../lib/assets/fonts/*', { query: '?url', eager: true });

const candidates = [
	'bg-primary',
	'text-secondary',
	'text-muted',
	'border-line',
	'text-faint',
	'bg-surface',
	'px-gutter',
	'font-display',
	'font-body'
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

const utilities: [selector: string, declaration: string][] = [
	['.bg-primary', 'background-color: var(--color-primary)'],
	['.text-secondary', 'color: var(--color-secondary)'],
	['.text-muted', 'color: var(--color-muted)'],
	['.border-line', 'border-color: var(--color-line)'],
	['.text-faint', 'color: var(--color-faint)'],
	['.bg-surface', 'background-color: var(--color-surface)'],
	['.px-gutter', 'padding-inline: var(--spacing-gutter)'],
	['.font-display', 'font-family: var(--font-display)'],
	['.font-body', 'font-family: var(--font-body)']
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
		for (const [selector, declaration] of utilities) {
			expect(ruleBody(css, selector), selector).toContain(declaration);
		}
		expect(ruleBody(css, ':root')).toContain('color-scheme: light dark');
		expect(ruleBody(css, ':root[data-theme="light"]')).toContain('color-scheme: light');
		expect(ruleBody(css, ':root[data-theme="dark"]')).toContain('color-scheme: dark');

		const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
		const krona = fontFaces.find((rule) => rule.includes('font-family: "Krona One"'));
		const instrument = fontFaces.find((rule) => rule.includes('font-family: "Instrument Sans"'));
		expect(krona).toMatch(/font-weight: 400;/);
		expect(krona).toMatch(/font-display: swap;/);
		expect(instrument).toMatch(/font-weight: 400 700;/);
		expect(instrument).toMatch(/font-display: swap;/);
	});

	it('points every url() at a font file that exists', () => {
		const urls = [...layoutCss.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
		expect(urls).toEqual(
			expect.arrayContaining([
				'../lib/assets/fonts/krona-one-latin.woff2',
				'../lib/assets/fonts/instrument-sans-latin-var.woff2'
			])
		);
		for (const url of urls) {
			expect(Object.keys(fontFiles), url).toContain(url);
		}
	});
});
