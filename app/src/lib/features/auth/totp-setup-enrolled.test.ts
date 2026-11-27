/**
 * Review finding N (frontend#261): every two-factor service keeps `session.mfaEnrolled` current,
 * but `getTotpSetup` did not, though its 200 means on and its 404 means off.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { session } from './session.svelte';
import { getTotpSetup } from './two-factor';

useMockApi();

const PATH = 'http://localhost/_allauth/browser/v1/account/authenticators/totp';
const api = () => createApi({ baseUrl: 'http://localhost' });

afterEach(() => session.reset());

describe('getTotpSetup and session.mfaEnrolled', () => {
	it('sets it to true on a 200', async () => {
		server.use(
			http.get(PATH, () =>
				HttpResponse.json({
					status: 200,
					data: { type: 'totp', created_at: 1, last_used_at: null }
				})
			)
		);
		session.apply({ status: 'signed_in', email: 'twofactor@example.com' });
		session.mfaEnrolled = false;
		await getTotpSetup({ api: api() });
		expect(session.mfaEnrolled).toBe(true);
	});

	it('sets it to false on a 404 with a setup key', async () => {
		server.use(
			http.get(PATH, () =>
				HttpResponse.json(
					{
						status: 404,
						meta: { secret: 'ABCDEFGH', totp_url: 'otpauth://totp/x?secret=ABCDEFGH' }
					},
					{ status: 404 }
				)
			)
		);
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		session.mfaEnrolled = true;
		await getTotpSetup({ api: api() });
		expect(session.mfaEnrolled).toBe(false);
	});
});
