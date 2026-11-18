import { describe, expect, it } from 'vitest';
import { WIDE_QUERY, toastPlacement } from './position.js';

describe('toastPlacement', () => {
	it('centers toasts above the tab bar and its safe-area inset below 960px', () => {
		const placement = toastPlacement(false);
		expect(placement.position).toBe('bottom-center');
		// The offset applies from 600px up and the mobile offset below it, so both must clear the bar.
		for (const offset of [placement.offset, placement.mobileOffset]) {
			expect(JSON.stringify(offset)).toContain('var(--tabbar-height)');
			expect(JSON.stringify(offset)).toContain('env(safe-area-inset-bottom)');
		}
	});

	it('puts toasts at the bottom right, 32px in, from 960px', () => {
		expect(toastPlacement(true)).toEqual({
			position: 'bottom-right',
			offset: '32px',
			mobileOffset: '32px'
		});
	});

	it('switches at the same width as the side nav', () => {
		expect(WIDE_QUERY).toBe('(min-width: 960px)');
	});
});
