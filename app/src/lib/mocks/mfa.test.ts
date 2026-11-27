/**
 * The mock's two-factor rules, through the real client: the sign-in code step, reauthentication
 * before input, each recovery code once, codes shown once, the organizer list and the OPEN API's
 * `mfa_required` gate. They follow the backend's `apps/accounts/mfa_views.py` and ADR 0043.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allauthParams, createApi } from '../api';
import {
	MFA_REQUIRED_EMAIL,
	MOCK_PASSWORD,
	MOCK_RECOVERY_CODES,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL,
	TWO_FACTOR_EMAIL,
	VERIFIED_EMAIL
} from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';

useMockApi();

const BASE = 'http://localhost';

function browser() {
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
	return createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
}

type Api = ReturnType<typeof browser>;

function login(api: Api, email: string, password = MOCK_PASSWORD) {
	return api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password }
	});
}

function mfaAuthenticate(api: Api, code: string) {
	return api.allauth.POST('/_allauth/{client}/v1/auth/2fa/authenticate', {
		params: allauthParams,
		body: { code }
	});
}

function reauthenticate(api: Api, password = MOCK_PASSWORD) {
	return api.allauth.POST('/_allauth/{client}/v1/auth/reauthenticate', {
		params: allauthParams,
		body: { password }
	});
}

function activate(api: Api, code: string) {
	return api.allauth.POST('/_allauth/{client}/v1/account/authenticators/totp', {
		params: allauthParams,
		body: { code }
	});
}

type FlowBody = { data?: { flows?: { id: string; is_pending?: boolean; types?: string[] }[] } };

const flowIds = (body: unknown) => ((body as FlowBody).data?.flows ?? []).map((flow) => flow.id);

afterEach(() => {
	vi.useRealTimers();
});

describe('sign-in with two-factor', () => {
	it('stops a TOTP account after the password with a pending mfa_authenticate flow', async () => {
		const api = browser();
		const result = await login(api, TWO_FACTOR_EMAIL);
		expect(result.response.status).toBe(401);
		const flows = (result.error as FlowBody).data?.flows ?? [];
		expect(flows).toContainEqual({
			id: 'mfa_authenticate',
			is_pending: true,
			types: ['totp', 'recovery_codes']
		});
		// A reload during the code step reads the same pending stage.
		const session = await api.allauth.GET('/_allauth/{client}/v1/auth/session', {
			params: allauthParams
		});
		expect(session.response.status).toBe(401);
		expect(flowIds(session.error)).toContain('mfa_authenticate');
	});

	it('is not signed in at the code step: the OPEN API answers 401', async () => {
		const api = browser();
		await login(api, TWO_FACTOR_EMAIL);
		const me = await api.open.GET('/api/v1/accounts/me');
		expect(me.response.status).toBe(401);
	});

	it('refuses a wrong code on the code field and keeps the stage', async () => {
		const api = browser();
		await login(api, TWO_FACTOR_EMAIL);
		const wrong = await mfaAuthenticate(api, '000000');
		expect(wrong.response.status).toBe(400);
		expect(wrong.error).toMatchObject({ errors: [{ param: 'code' }] });
		const right = await mfaAuthenticate(api, MOCK_TOTP_CODE);
		expect(right.response.status).toBe(200);
		expect(right.data?.data.methods).toContainEqual(expect.objectContaining({ method: 'mfa' }));
	});

	it('takes each recovery code once', async () => {
		const [code] = MOCK_RECOVERY_CODES;
		const first = browser();
		await login(first, TWO_FACTOR_EMAIL);
		expect((await mfaAuthenticate(first, code)).response.status).toBe(200);
		await first.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams });
		const again = browser();
		await login(again, TWO_FACTOR_EMAIL);
		expect((await mfaAuthenticate(again, code)).response.status).toBe(400);
	});

	it('ends the pending stage on DELETE auth/session', async () => {
		const api = browser();
		await login(api, TWO_FACTOR_EMAIL);
		await api.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams });
		const session = await api.allauth.GET('/_allauth/{client}/v1/auth/session', {
			params: allauthParams
		});
		expect(flowIds(session.error)).not.toContain('mfa_authenticate');
	});

	it('signs an account without TOTP straight in', async () => {
		const api = browser();
		const result = await login(api, VERIFIED_EMAIL);
		expect(result.response.status).toBe(200);
	});
});

describe('turning TOTP on', () => {
	it('gives a setup key while TOTP is off', async () => {
		const api = browser();
		await login(api, VERIFIED_EMAIL);
		const status = await api.allauth.GET('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams
		});
		expect(status.response.status).toBe(404);
		const meta = (status.error as { meta: { secret: string; totp_url: string } }).meta;
		expect(meta.secret).toMatch(/^[A-Z2-7]+$/);
		expect(meta.totp_url).toContain(`secret=${meta.secret}`);
	});

	it('asks for a reauthentication before it reads the code, after a fresh login', async () => {
		const api = browser();
		await login(api, VERIFIED_EMAIL);
		// A wrong code still gets the 401: the code is never checked first.
		const first = await activate(api, '000000');
		expect(first.response.status).toBe(401);
		expect(flowIds(first.error)).toEqual(['reauthenticate']);
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)?.totp).toBeUndefined();
	});

	it('turns on after a password reauthentication and the right code', async () => {
		const api = browser();
		await login(api, VERIFIED_EMAIL);
		expect((await reauthenticate(api, 'wrong-password')).response.status).toBe(400);
		expect((await reauthenticate(api)).response.status).toBe(200);
		expect((await activate(api, '000000')).response.status).toBe(400);
		const on = await activate(api, MOCK_TOTP_CODE);
		expect(on.response.status).toBe(200);
		expect(on.data?.data.type).toBe('totp');
		// The enrolling session passed two-factor: the OPEN API stays open to it.
		expect((await api.open.GET('/api/v1/accounts/me')).response.status).toBe(200);
	});

	it('counts a reauthentication as recent for 300 seconds only', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const api = browser();
		await login(api, VERIFIED_EMAIL);
		await reauthenticate(api);
		vi.setSystemTime(Date.now() + 301_000);
		expect((await activate(api, MOCK_TOTP_CODE)).response.status).toBe(401);
	});
});

describe('with TOTP on', () => {
	async function signedInWithCode(api: Api) {
		await login(api, TWO_FACTOR_EMAIL);
		await mfaAuthenticate(api, MOCK_TOTP_CODE);
	}

	it('lists TOTP and the recovery codes', async () => {
		const api = browser();
		await signedInWithCode(api);
		const list = await api.allauth.GET('/_allauth/{client}/v1/account/authenticators', {
			params: allauthParams
		});
		const types = list.data?.data.map((authenticator) => authenticator.type);
		expect(types).toEqual(['totp', 'recovery_codes']);
	});

	it('shows the unused recovery codes once', async () => {
		const api = browser();
		await signedInWithCode(api);
		const path = '/_allauth/{client}/v1/account/authenticators/recovery-codes' as const;
		const first = await api.allauth.GET(path, { params: allauthParams });
		expect(first.data?.data.unused_codes).toEqual([...MOCK_RECOVERY_CODES]);
		const second = await api.allauth.GET(path, { params: allauthParams });
		expect(second.data?.data.unused_codes).toBeUndefined();
		expect(second.data?.data.unused_code_count).toBe(MOCK_RECOVERY_CODES.length);
	});

	it('offers both reauthentications to remove TOTP, then removes it after a code', async () => {
		const api = browser();
		await signedInWithCode(api);
		const path = '/_allauth/{client}/v1/account/authenticators/totp' as const;
		const first = await api.allauth.DELETE(path, { params: allauthParams });
		expect(first.response.status).toBe(401);
		expect(flowIds(first.error)).toEqual(['reauthenticate', 'mfa_reauthenticate']);
		const reauth = await api.allauth.POST('/_allauth/{client}/v1/auth/2fa/reauthenticate', {
			params: allauthParams,
			body: { code: MOCK_TOTP_CODE }
		});
		expect(reauth.response.status).toBe(200);
		expect((await api.allauth.DELETE(path, { params: allauthParams })).response.status).toBe(200);
		expect(mockStore.accountByEmail(TWO_FACTOR_EMAIL)?.totp).toBeUndefined();
	});

	it('makes new recovery codes after a reauthentication, and shows them', async () => {
		const api = browser();
		await signedInWithCode(api);
		const path = '/_allauth/{client}/v1/account/authenticators/recovery-codes' as const;
		expect((await api.allauth.POST(path, { params: allauthParams })).response.status).toBe(401);
		await reauthenticate(api);
		const made = await api.allauth.POST(path, { params: allauthParams });
		expect(made.response.status).toBe(200);
		const codes = (made.data as unknown as { data: { unused_codes: string[] } }).data.unused_codes;
		expect(codes).toHaveLength(10);
		expect(codes).not.toContain(MOCK_RECOVERY_CODES[0]);
	});

	it('offers only the code to a session that never passed two-factor', async () => {
		const api = browser();
		await signedInWithCode(api);
		const session = mockStore.state.session;
		if (session) session.mfaAt = null;
		const result = await api.allauth.DELETE('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams
		});
		expect(result.response.status).toBe(401);
		expect(flowIds(result.error)).toEqual(['mfa_reauthenticate']);
		// The OPEN API refuses it too.
		const me = await api.open.GET('/api/v1/accounts/me');
		expect(me.response.status).toBe(403);
		expect(me.error).toMatchObject({ code: 'mfa_required' });
	});
});

describe('organizers and mfa_required', () => {
	it('lists the organizer memberships, empty for anyone else', async () => {
		const organizer = browser();
		await login(organizer, ORGANIZER_EMAIL);
		const mine = await organizer.open.GET('/api/v1/organizer/organizers');
		expect(mine.data).toEqual([
			expect.objectContaining({ verified: true, role: 'admin', name: expect.any(String) })
		]);
		// The mock is one browser session: sign out before the next account signs in.
		await organizer.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams });
		const player = browser();
		await login(player, VERIFIED_EMAIL);
		expect((await player.open.GET('/api/v1/organizer/organizers')).data).toEqual([]);
	});

	it('refuses an Event to a member without TOTP with a plain 403, then allows it after', async () => {
		const api = browser();
		await login(api, ORGANIZER_EMAIL);
		const [membership] = (await api.open.GET('/api/v1/organizer/organizers')).data ?? [];
		const body = {
			organizer: membership.organizer,
			name: 'Made-up Open',
			kind: 'tournament' as const,
			start_date: '2026-12-05',
			end_date: '2026-12-06'
		};
		const refused = await api.open.POST('/api/v1/organizer/events', { body });
		expect(refused.response.status).toBe(403);
		expect(refused.error).toMatchObject({ code: 'forbidden' });
		await reauthenticate(api);
		await activate(api, MOCK_TOTP_CODE);
		expect((await api.open.GET('/api/v1/organizer/events')).response.status).toBe(200);
		const created = await api.open.POST('/api/v1/organizer/events', { body });
		expect(created.response.status).toBe(201);
		expect(created.data?.organizer).toBe(membership.organizer);
	});

	it('answers mfa_required to an account that must have two-factor and has none', async () => {
		const api = browser();
		await login(api, MFA_REQUIRED_EMAIL);
		const me = await api.open.GET('/api/v1/accounts/me');
		expect(me.response.status).toBe(403);
		expect(me.error).toMatchObject({ code: 'mfa_required' });
		// allauth stays open, so it can set two-factor up.
		const totp = await api.allauth.GET('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams
		});
		expect(totp.response.status).toBe(404);
	});
});
