/**
 * Review finding T5 (frontend#261): "That took too long. Sign in again." stayed after the next
 * sign-in attempt failed (a wrong password throws before the store takes a new state), so it
 * showed next to the wrong-password error.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { login } from './services';
import { session } from './session.svelte';

useMockApi();

afterEach(() => session.reset());

describe('a new sign-in attempt after the code step ran out', () => {
	it('forgets the reason, even when the attempt fails', async () => {
		session.apply({ status: 'signed_out' });
		session.mfaTimedOut = true;
		const api = createApi({
			baseUrl: 'http://localhost',
			getCookies: () => `csrftoken=${mockStore.state.csrfToken}`
		});
		await expect(
			login({ email: VERIFIED_EMAIL, password: 'not-the-password' }, { api })
		).rejects.toMatchObject({ code: 'email_password_mismatch' });
		expect(session.mfaTimedOut).toBe(false);
	});
});
