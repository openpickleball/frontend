import { describe, expect, it } from 'vitest';
import { shouldRegister } from './register';

describe('shouldRegister', () => {
	const ok = { dev: false, supported: true };

	it('registers in a production build', () => {
		expect(shouldRegister(ok)).toBe(true);
	});

	it('does not register in dev or without browser support', () => {
		expect(shouldRegister({ ...ok, dev: true })).toBe(false);
		expect(shouldRegister({ ...ok, supported: false })).toBe(false);
	});
});
