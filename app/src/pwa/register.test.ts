import { describe, expect, it } from 'vitest';
import { shouldRegister } from './register';

describe('shouldRegister', () => {
	const ok = { mock: 'off', dev: false, supported: true };

	it('registers in a production build with mocks off', () => {
		expect(shouldRegister(ok)).toBe(true);
	});

	it('never registers in the mock modes, where MSW owns the worker', () => {
		expect(shouldRegister({ ...ok, mock: 'missing' })).toBe(false);
		expect(shouldRegister({ ...ok, mock: 'all' })).toBe(false);
	});

	it('does not register in dev or without browser support', () => {
		expect(shouldRegister({ ...ok, dev: true })).toBe(false);
		expect(shouldRegister({ ...ok, supported: false })).toBe(false);
	});
});
