import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ThemeToggle from './theme-toggle.svelte';
import {
	THEME_COLORS,
	THEME_STORAGE_KEY,
	applyTheme,
	currentTheme,
	nextTheme,
	toggleLabel
} from './theme.js';

function fakeDocument(metaCount = 2) {
	const metas = Array.from({ length: metaCount }, () => ({ content: '' }));
	const selectors: string[] = [];
	return {
		metas,
		selectors,
		documentElement: { dataset: {} as { theme?: string } },
		querySelectorAll(selector: string) {
			selectors.push(selector);
			return metas;
		}
	};
}

describe('currentTheme', () => {
	it('uses the stored choice on <html data-theme>', () => {
		expect(currentTheme({ dataset: { theme: 'light' } }, false)).toBe('light');
		expect(currentTheme({ dataset: { theme: 'dark' } }, true)).toBe('dark');
	});

	it('follows the system setting when nothing is stored', () => {
		expect(currentTheme({ dataset: {} }, true)).toBe('light');
		expect(currentTheme({ dataset: {} }, false)).toBe('dark');
	});

	it('ignores a value that is not a theme', () => {
		expect(currentTheme({ dataset: { theme: 'sepia' } }, true)).toBe('light');
	});
});

describe('nextTheme and toggleLabel', () => {
	it('flips whichever theme is showing', () => {
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('light');
	});

	it('names the theme a click switches to, as the site does', () => {
		expect(toggleLabel('light')).toBe('Switch to black theme');
		expect(toggleLabel('dark')).toBe('Switch to ivory theme');
	});
});

describe('applyTheme', () => {
	it('sets data-theme, the theme-color metas and the stored choice', () => {
		const doc = fakeDocument();
		const setItem = vi.fn();
		applyTheme('light', doc, { setItem });
		expect(doc.documentElement.dataset.theme).toBe('light');
		expect(doc.selectors).toEqual(['meta[name="theme-color"]']);
		expect(doc.metas.map((m) => m.content)).toEqual(['#f7f3e8', '#f7f3e8']);
		expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');

		applyTheme('dark', doc, { setItem });
		expect(doc.documentElement.dataset.theme).toBe('dark');
		expect(doc.metas.map((m) => m.content)).toEqual(['#000000', '#000000']);
		expect(setItem).toHaveBeenLastCalledWith('theme', 'dark');
	});

	it('still applies the theme when storage is blocked', () => {
		const doc = fakeDocument();
		const setItem = vi.fn(() => {
			throw new Error('blocked');
		});
		expect(() => applyTheme('light', doc, { setItem })).not.toThrow();
		expect(doc.documentElement.dataset.theme).toBe('light');
	});

	it('uses the page background of each theme for the browser chrome', () => {
		expect(THEME_COLORS).toEqual({ light: '#f7f3e8', dark: '#000000' });
	});
});

describe('ThemeToggle', () => {
	it('renders a button with an accessible name and both icons', () => {
		const { body } = render(ThemeToggle);
		expect(body).toMatch(/<button[^>]*type="button"/);
		expect(body).toContain('size-11');
		expect(body).toContain('aria-label="Switch to ivory theme"');
		// The sun shows in the black theme and the moon in the ivory theme, by the light: variant.
		expect(body).toContain('light:hidden');
		expect(body).toContain('light:block');
		expect(body.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2);
	});

	it('takes extra classes', () => {
		const { body } = render(ThemeToggle, { props: { class: '-mr-3' } });
		expect(body).toContain('-mr-3');
	});
});
