import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi, isAppError, reauthFlowsOf, type Api, type AppError } from '#lib/api/index.js';
import {
	MOCK_PASSWORD,
	MOCK_RECOVERY_CODES,
	MOCK_TOTP_CODE,
	MOCK_TOTP_SECRET,
	TWO_FACTOR_EMAIL,
	VERIFIED_EMAIL
} from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { authenticateMfa, login, reauthenticate, resetBootstrap } from './services';
import { session } from './session.svelte';
import {
	activateTotp,
	deactivateTotp,
	getRecoveryCodes,
	getTotpSetup,
	listAuthenticators,
	regenerateRecoveryCodes
} from './two-factor';

useMockApi();

const BASE = 'http://localhost';
let api: Api;

beforeEach(() => {
	const jar = new Map<string, string>();
	const fetchWithJar: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	api = createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
	resetBootstrap();
	session.reset();
});

async function failure(promise: Promise<unknown>): Promise<AppError> {
	try {
		await promise;
	} catch (cause) {
		if (isAppError(cause)) return cause;
		throw cause;
	}
	throw new Error('expected the call to fail');
}

async function signInWithCode() {
	await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
	await authenticateMfa(MOCK_TOTP_CODE, { api });
}

describe('with two-factor off', () => {
	beforeEach(async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
	});

	it('gives the setup key and its otpauth link', async () => {
		const setup = await getTotpSetup({ api });
		expect(setup).toEqual({
			status: 'off',
			secret: MOCK_TOTP_SECRET,
			totpUrl: expect.stringContaining(`secret=${MOCK_TOTP_SECRET}`)
		});
	});

	it('lists nothing, and says two-factor is off', async () => {
		expect(await listAuthenticators({ api })).toEqual({ totp: null, recoveryCodes: null });
		expect(session.mfaEnrolled).toBe(false);
	});

	it('asks for a reauthentication to turn on, then turns on with the code', async () => {
		const asked = await failure(activateTotp(MOCK_TOTP_CODE, { api }));
		expect(reauthFlowsOf(asked)).toEqual(['password']);
		await reauthenticate(MOCK_PASSWORD, { api });
		const wrong = await failure(activateTotp('000000', { api }));
		expect(wrong.fields.code).toEqual(['Incorrect code.']);
		await activateTotp(MOCK_TOTP_CODE, { api });
		expect(session.mfaEnrolled).toBe(true);
		const codes = await getRecoveryCodes({ api });
		expect(codes?.codes).toHaveLength(10);
		expect(codes?.unused).toBe(10);
	});
});

describe('with two-factor on', () => {
	beforeEach(signInWithCode);

	it('says when it was turned on, and how many codes are unused', async () => {
		const list = await listAuthenticators({ api });
		expect(list.totp?.createdAt).toBeInstanceOf(Date);
		expect(list.recoveryCodes).toEqual({ total: 10, unused: 10 });
		expect(session.mfaEnrolled).toBe(true);
		expect(await getTotpSetup({ api })).toEqual({ status: 'on' });
	});

	it('shows the recovery codes once', async () => {
		// Reading the codes needs a recent reauthentication, as allauth's view does.
		await reauthenticate(MOCK_PASSWORD, { api });
		expect((await getRecoveryCodes({ api }))?.codes).toEqual([...MOCK_RECOVERY_CODES]);
		expect((await getRecoveryCodes({ api }))?.codes).toEqual([]);
	});

	it('makes new codes after a reauthentication, and parses the untyped answer', async () => {
		expect(reauthFlowsOf(await failure(regenerateRecoveryCodes({ api })))).toEqual([
			'password',
			'code'
		]);
		await reauthenticate(MOCK_PASSWORD, { api });
		const made = await regenerateRecoveryCodes({ api });
		expect(made.codes).toHaveLength(10);
		expect(made.unused).toBe(10);
	});

	it('refuses an answer of another shape as a server error', async () => {
		await reauthenticate(MOCK_PASSWORD, { api });
		server.use(
			http.post(`${BASE}/_allauth/browser/v1/account/authenticators/recovery-codes`, () =>
				HttpResponse.json({ status: 200, data: { codes: 'x' } })
			)
		);
		expect((await failure(regenerateRecoveryCodes({ api }))).kind).toBe('server');
	});

	it('turns off after a reauthentication', async () => {
		await reauthenticate(MOCK_PASSWORD, { api });
		await deactivateTotp({ api });
		expect(session.mfaEnrolled).toBe(false);
		expect((await getTotpSetup({ api })).status).toBe('off');
	});
});
