/**
 * Review finding D (frontend#261): nothing closed the reauthentication prompt when the session
 * left signed in (a sign out, or an expiry), so it stayed open over the sign-in page and its call
 * never settled.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { reauthPrompt, requestReauth } from './reauth.svelte';
import { session } from './session.svelte';

afterEach(() => {
	reauthPrompt.settle(false);
	session.reset();
});

describe('the reauthentication prompt when the session ends', () => {
	it('closes and answers false on a sign out', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const asked = requestReauth(['password']);
		session.apply({ status: 'signed_out' });
		expect(await asked).toBe(false);
		expect(reauthPrompt.request).toBeNull();
	});

	it('closes and answers false when the session expires', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const asked = requestReauth(['code']);
		session.expire();
		expect(await asked).toBe(false);
		expect(reauthPrompt.request).toBeNull();
	});

	it('stays open while the same account is applied again', () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		void requestReauth(['password']);
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		expect(reauthPrompt.request).not.toBeNull();
	});
});
