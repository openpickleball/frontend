import { describe, expect, it } from 'vitest';
import { fieldA11y } from './a11y.js';

describe('fieldA11y', () => {
	it('names the error and hint ids from the control id', () => {
		const a11y = fieldA11y({ id: 'played-on' });
		expect(a11y.errorId).toBe('played-on-error');
		expect(a11y.hintId).toBe('played-on-hint');
	});

	it('sets nothing for a field with no error and no hint', () => {
		expect(fieldA11y({ id: 'x' }).attrs).toEqual({
			'aria-invalid': undefined,
			'aria-describedby': undefined
		});
	});

	it('points at the hint when there is one', () => {
		expect(fieldA11y({ id: 'x', hint: 'Help' }).attrs['aria-describedby']).toBe('x-hint');
	});

	it('lets the error take the place of the hint', () => {
		const { attrs } = fieldA11y({ id: 'x', hint: true, error: 'Wrong' });
		expect(attrs['aria-invalid']).toBe('true');
		expect(attrs['aria-describedby']).toBe('x-error');
	});

	it('keeps the hint beside the error when asked', () => {
		const { attrs } = fieldA11y({ id: 'x', hint: true, keepHint: true, error: 'Wrong' });
		expect(attrs['aria-describedby']).toBe('x-hint x-error');
	});

	it('puts other ids before and after', () => {
		const { attrs } = fieldA11y({
			id: 'x',
			error: 'Wrong',
			before: ['x-help'],
			after: ['x-preview']
		});
		expect(attrs['aria-describedby']).toBe('x-help x-error x-preview');
	});
});
