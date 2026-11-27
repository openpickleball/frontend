/**
 * Review finding U2 (frontend#261): `checkMfaEnrolled` wrote its answer over a newer value. A
 * slow read that came back "off" after turning TOTP on had set "on" won, and its write also
 * made the account state read skip its own, correct, write.
 */
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { checkMfaEnrolled } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';

afterEach(() => session.reset());

describe('checkMfaEnrolled and a newer two-factor value', () => {
	it('keeps a value set while it waited, and leaves the count of writes alone', async () => {
		server.use(
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, async () => {
				await delay(50);
				return HttpResponse.json({ status: 200, data: [] });
			})
		);
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const checking = checkMfaEnrolled({ api: createApi({ baseUrl: BASE }) });
		// TOTP was turned on while the read waited.
		session.mfaEnrolled = true;
		const revision = session.mfaRevision;
		await checking;
		expect(session.mfaEnrolled).toBe(true);
		expect(session.mfaRevision).toBe(revision);
	});
});
