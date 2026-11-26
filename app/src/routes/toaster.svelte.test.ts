import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import axe from 'axe-core';
import { toast } from 'svelte-sonner';
import './layout.css';
import Toaster from '#lib/ui/sonner/sonner.svelte';

// The two themes. `data-theme` on the root is what the theme toggle sets, and it overrides the
// system setting through `color-scheme`.
const THEMES = ['light', 'dark'] as const;

afterEach(() => {
	toast.dismiss();
	document.documentElement.removeAttribute('data-theme');
});

/** Show a toast with a title, a description and two buttons, and wait for it to appear. */
async function showToast(theme: (typeof THEMES)[number]) {
	document.documentElement.setAttribute('data-theme', theme);
	render(Toaster);
	toast('Update available', {
		description: 'Reload to get the latest version.',
		duration: Infinity,
		action: { label: 'Reload', onClick: () => {} },
		cancel: { label: 'Later', onClick: () => {} }
	});
	await expect.poll(() => document.querySelector('[data-sonner-toast]')).not.toBeNull();
	const el = document.querySelector<HTMLElement>('[data-sonner-toast]')!;
	// Wait for the enter animation so axe reads the final colors.
	await expect.poll(() => el.getAttribute('data-mounted')).toBe('true');
	return el;
}

function rgba(color: string) {
	const m = color.match(/[\d.]+/g)!.map(Number);
	return { rgb: m.slice(0, 3), alpha: m[3] ?? 1 };
}

function luminance(rgb: number[]) {
	const [r, g, b] = rgb.map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: number[], bg: number[]) {
	const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
	return (a + 0.05) / (b + 0.05);
}

/** The ratio of an element's text color to its background, drawn over the toast's background. */
function contrast(node: Element, toastBg: number[]) {
	const style = getComputedStyle(node);
	const own = rgba(style.backgroundColor);
	const bg = toastBg.map((v, i) => v * (1 - own.alpha) + own.rgb[i] * own.alpha);
	return ratio(rgba(style.color).rgb, bg);
}

describe('Toaster', () => {
	for (const theme of THEMES) {
		it(`passes axe with a title, description and buttons (${theme})`, async () => {
			const el = await showToast(theme);
			const results = await axe.run(el, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
			});
			expect(results.violations.map((v) => v.id)).toEqual([]);
		});

		// Axe passed on the old gray description too, so this measures the computed colors directly.
		it(`keeps every part at 4.5:1 or better (${theme})`, async () => {
			const el = await showToast(theme);
			const bg = rgba(getComputedStyle(el).backgroundColor).rgb;
			const measured = {
				title: contrast(el.querySelector('[data-title]')!, bg),
				description: contrast(el.querySelector('[data-description]')!, bg),
				action: contrast(el.querySelector('[data-button]')!, bg),
				cancel: contrast(el.querySelector('[data-cancel]')!, bg)
			};
			for (const value of Object.values(measured)) expect(value).toBeGreaterThanOrEqual(4.5);
		});
	}
});
