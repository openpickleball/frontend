/**
 * Review finding T2 (frontend#261): every join replaced the open request, and the prompt then
 * reset itself as for a new one: back to the first method, back to the app code, errors cleared.
 * A player who switched to a recovery code got a 6-digit error, and a code-only prompt joined by
 * a password request jumped to the password field.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { reauthPrompt, requestReauth } from '../reauth.svelte.js';
import ReauthPrompt from './reauth-prompt.svelte';

afterEach(() => reauthPrompt.settle(false));

describe('ReauthPrompt when another call joins it', () => {
	it('keeps the same request when the join adds nothing', () => {
		void requestReauth(['code'], ['totp', 'recovery_codes']);
		const before = reauthPrompt.request;
		void requestReauth(['code'], ['totp']);
		expect(reauthPrompt.request).toBe(before);
	});

	it('keeps the player on the recovery code they are typing', async () => {
		const screen = await render(ReauthPrompt);
		void requestReauth(['code'], ['totp', 'recovery_codes']);
		await screen.getByRole('button', { name: 'Use a recovery code' }).click();
		await screen.getByLabelText('Recovery code').fill('mock0001');
		void requestReauth(['code'], ['totp', 'recovery_codes']);
		void requestReauth(['password']);
		await expect.element(screen.getByLabelText('Recovery code')).toHaveValue('mock0001');
		expect(screen.getByLabelText('Password', { exact: true }).query()).toBeNull();
		// The join added the password, so the switch to it is offered now.
		await expect
			.element(screen.getByRole('button', { name: 'Use your password instead' }))
			.toBeVisible();
	});
});
