/**
 * Found in the live drive against the real backend (frontend#261): once the recovery codes were
 * shown, allauth's `GET recovery-codes` leaves `unused_codes` out of the body altogether (its
 * `_authenticator_data` adds the key only while the codes may be viewed). It does not send an
 * empty list.
 */
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { getRecoveryCodes } from './two-factor';

useMockApi();

const BASE = 'http://localhost';
const PATH = `${BASE}/_allauth/browser/v1/account/authenticators/recovery-codes`;

describe('getRecoveryCodes after the codes were shown once', () => {
	it('reads a body with no unused_codes as no codes to show, and keeps the counts', async () => {
		server.use(
			http.get(PATH, () =>
				HttpResponse.json({
					status: 200,
					data: {
						type: 'recovery_codes',
						created_at: 1795744735.71,
						last_used_at: null,
						total_code_count: 10,
						unused_code_count: 9
					}
				})
			)
		);
		const api = createApi({ baseUrl: BASE });
		expect(await getRecoveryCodes({ api })).toEqual({ codes: [], total: 10, unused: 9 });
	});
});
