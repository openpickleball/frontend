/**
 * Review finding U1 (frontend#261): the `mfa_required` notice recorded the account only after it
 * had waited for the account state read. When A was refused, signed out, and B signed in before
 * that read settled, the notice went to B (at once when B's two-factor was already known on).
 */
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { loadAccountState, watchMfaRequired } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';

afterEach(() => session.reset());

describe('watchMfaRequired and the account that was refused', () => {
	it("never tells a later account about an earlier account's refusal", async () => {
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () =>
				HttpResponse.json({ code: 'mfa_required', message: 'x', errors: [] }, { status: 403 })
			),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, async () => {
				await delay(80);
				return HttpResponse.json({ status: 200, data: [] });
			})
		);
		const api = createApi({ baseUrl: BASE });
		session.apply({ status: 'signed_in', email: 'first@example.com' });
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		// A's own read: its organizer call is refused while its authenticator call is still out.
		const reading = loadAccountState({ api });
		await delay(20);
		session.apply({ status: 'signed_out' });
		session.apply({ status: 'signed_in', email: 'second@example.com' });
		session.mfaEnrolled = true;
		await reading;
		await delay(50);
		stop();
		expect(heard).toEqual([]);
	});
});
