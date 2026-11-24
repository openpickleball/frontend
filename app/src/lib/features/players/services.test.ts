import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, allauthParams, createApi, type Api } from '#lib/api/index.js';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { fetchMyPlayer, fetchMySettings, updateMySettings } from './services.js';

useMockApi();

const BASE = 'http://localhost';
const tamsin = PLAYERS.find((p) => p.key === 'tamsin') as (typeof PLAYERS)[number];

/** The real client with a cookie jar, as a browser has, recording each call and its body. */
function browserApi() {
	const jar = new Map<string, string>();
	const calls: { call: string; body: unknown }[] = [];
	const fetchWithJar: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const text = await request.clone().text();
		calls.push({
			call: `${request.method} ${new URL(request.url).pathname}`,
			body: text ? JSON.parse(text) : undefined
		});
		const response = await fetch(request);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return { api: createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies }), calls };
}

let api: Api;
let calls: { call: string; body: unknown }[];

async function signIn(email: string) {
	const result = await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password: MOCK_PASSWORD }
	});
	expect(result.response.status).toBe(200);
	calls.length = 0;
}

beforeEach(async () => {
	const browser = browserApi();
	api = browser.api;
	calls = browser.calls;
	await api.initCsrf();
});

describe('fetchMyPlayer', () => {
	it('reads the code and display name from me/player with the client it is given', async () => {
		await signIn(VERIFIED_EMAIL);
		expect(await fetchMyPlayer({ api })).toEqual({
			code: tamsin.code,
			displayName: tamsin.displayName
		});
		expect(calls.map((c) => c.call)).toEqual(['GET /api/v1/me/player']);
	});

	it('is null for an account with no player (404)', async () => {
		mockStore.state.accounts.push({
			email: 'fresh@example.com',
			password: MOCK_PASSWORD,
			verified: true,
			active: true
		});
		await signIn('fresh@example.com');
		expect(await fetchMyPlayer({ api })).toBeNull();
	});

	it('throws a 401 when nobody is signed in', async () => {
		await expect(fetchMyPlayer({ api })).rejects.toMatchObject({ status: 401 });
	});
});

describe('fetchMySettings', () => {
	beforeEach(() => signIn(VERIFIED_EMAIL));

	it('maps me/player to the name and privacy settings', async () => {
		const player = mockStore.playerByCode(tamsin.code);
		if (player) player.privacy.stats_visibility = 'private';
		expect(await fetchMySettings({ api })).toEqual({
			displayName: tamsin.displayName,
			privacy: {
				match_history: 'signed_in',
				stats: 'private',
				rating_history: 'signed_in',
				home_club: 'signed_in',
				city_region: 'signed_in'
			}
		});
		expect(calls.map((c) => c.call)).toEqual(['GET /api/v1/me/player']);
	});

	it('is null when the backend has no me/player (405)', async () => {
		server.use(
			http.get('*/api/v1/me/player', () => new HttpResponse(null, { status: 405 }), {
				once: true
			})
		);
		expect(await fetchMySettings({ api })).toBeNull();
	});

	it('throws other failures', async () => {
		server.use(
			http.get(
				'*/api/v1/me/player',
				() =>
					HttpResponse.json(
						{ code: 'server_error', message: 'Server error.', errors: [] },
						{ status: 500 }
					),
				{ once: true }
			)
		);
		await expect(fetchMySettings({ api })).rejects.toBeInstanceOf(AppError);
	});
});

describe('updateMySettings', () => {
	beforeEach(() => signIn(VERIFIED_EMAIL));

	it('sends only what changes, with the backend field names', async () => {
		await updateMySettings({ privacy: { stats: 'private' } }, { api });
		await updateMySettings({ displayName: 'Tam Vale' }, { api });
		expect(calls).toEqual([
			{ call: 'PATCH /api/v1/me/player', body: { privacy: { stats_visibility: 'private' } } },
			{ call: 'PATCH /api/v1/me/player', body: { display_name: 'Tam Vale' } }
		]);
	});

	it('returns the settings the backend holds', async () => {
		const saved = await updateMySettings({ displayName: '  Tam Vale ' }, { api });
		expect(saved.displayName).toBe('Tam Vale');
		expect(saved.privacy.match_history).toBe('signed_in');
		expect(mockStore.playerByCode(tamsin.code)?.displayName).toBe('Tam Vale');
	});

	it('throws when the save is refused', async () => {
		const refused = updateMySettings({ displayName: '   ' }, { api });
		await expect(refused).rejects.toBeInstanceOf(AppError);
		await expect(refused).rejects.toMatchObject({ status: 422 });
		expect(mockStore.playerByCode(tamsin.code)?.displayName).toBe(tamsin.displayName);
	});
});
