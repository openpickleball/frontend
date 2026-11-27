/** Review finding M (frontend#261): offer a recovery code only when the backend does. */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { reauthPrompt, requestReauth } from '../reauth.svelte.js';
import ReauthPrompt from './reauth-prompt.svelte';

afterEach(() => reauthPrompt.settle(false));

describe('ReauthPrompt and recovery codes', () => {
	it('has no recovery code switch when the backend takes only a code from the app', async () => {
		const screen = await render(ReauthPrompt);
		void requestReauth(['code'], ['totp']);
		await expect.element(screen.getByLabelText('Code from your app')).toBeVisible();
		expect(screen.getByRole('button', { name: 'Use a recovery code' }).query()).toBeNull();
	});

	it('has the switch when the backend takes recovery codes too', async () => {
		const screen = await render(ReauthPrompt);
		void requestReauth(['code'], ['totp', 'recovery_codes']);
		await expect.element(screen.getByRole('button', { name: 'Use a recovery code' })).toBeVisible();
	});
});
