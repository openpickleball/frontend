/**
 * Review finding E (frontend#261): the prompt kept the typed password and code after it closed.
 * They live with the prompt's state now, and every close clears them.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { reauthPrompt, requestReauth } from './reauth.svelte';

afterEach(() => reauthPrompt.settle(false));

describe('the prompt forgets what was typed when it closes', () => {
	it.each([
		['a confirm', true],
		['a cancel', false]
	])('clears the password and the code after %s', (_, ok) => {
		void requestReauth(['password', 'code']);
		reauthPrompt.password = 'made-up-password';
		reauthPrompt.code = '123456';
		reauthPrompt.settle(ok);
		expect(reauthPrompt.password).toBe('');
		expect(reauthPrompt.code).toBe('');
	});
});
