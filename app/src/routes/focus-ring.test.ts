import { describe, expect, it } from 'vitest';
import layoutCss from './layout.css?raw';

// One focus ring for the whole app (frontend#82, frontend#120). The global rule in layout.css
// draws it. Components must not restyle it, and must not turn the outline off on controls.
const sources = import.meta.glob('../lib/**/*.svelte', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// An inset ring where an outer one would be clipped by the tab bar edges.
const insetAllowed = ['../lib/ui/app-shell/tab-bar.svelte'];

describe('focus ring', () => {
	it('is one global rule with a visible style, width and offset', () => {
		expect(layoutCss).toMatch(
			/:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-secondary\);\s*outline-offset:\s*2px;/
		);
	});

	it('is not overridden by component classes', () => {
		const offenders: string[] = [];
		for (const [path, source] of Object.entries(sources)) {
			if (insetAllowed.includes(path)) continue;
			if (/focus-visible:(outline|border-secondary)/.test(source)) offenders.push(path);
		}
		expect(offenders).toEqual([]);
	});

	it('keeps outline-none off the input and button components', () => {
		for (const path of ['../lib/ui/input/input.svelte', '../lib/ui/button/button.svelte']) {
			expect(sources[path]).toBeDefined();
			expect(sources[path]).not.toMatch(/outline-none/);
		}
	});
});
