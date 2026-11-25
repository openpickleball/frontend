import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, allauthParams, createApi, type Api } from '#lib/api/index.js';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import {
	AGE_REFUSAL_MESSAGE,
	createMyPlayer,
	fetchMyPlayer,
	fetchMySettings,
	updateMySettings
} from './services.js';

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

const FRESH = 'fresh@example.com';

/** Sign in as a verified account with no player. */
async function signInFresh() {
	mockStore.state.accounts.push({
		email: FRESH,
		password: MOCK_PASSWORD,
		verified: true,
		active: true
	});
	await signIn(FRESH);
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

	it("is 'none' for an account with no player (404)", async () => {
		await signInFresh();
		expect(await fetchMyPlayer({ api })).toBe('none');
	});

	it("is 'unavailable' when the backend has no me/player (405)", async () => {
		await signIn(VERIFIED_EMAIL);
		server.use(
			http.get('*/api/v1/me/player', () => new HttpResponse(null, { status: 405 }), {
				once: true
			})
		);
		expect(await fetchMyPlayer({ api })).toBe('unavailable');
	});

	it('throws a server error for a code that does not parse', async () => {
		await signIn(VERIFIED_EMAIL);
		server.use(
			http.get(
				'*/api/v1/me/player',
				() =>
					HttpResponse.json({
						...mockStore.myPlayerOut(mockStore.playerByCode(tamsin.code)!),
						code: '???'
					}),
				{ once: true }
			)
		);
		await expect(fetchMyPlayer({ api })).rejects.toMatchObject({ kind: 'server' });
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

describe('createMyPlayer', () => {
	const details = {
		display_name: 'Fern Mock',
		birth_year: 1990,
		birth_month: 6,
		gender_division: 'womens'
	};

	/** A ninja error answer for POST me/player. */
	function answerPost(status: number, errors: unknown[] = []) {
		server.use(
			http.post(
				'*/api/v1/me/player',
				() => HttpResponse.json({ code: 'error', message: 'Error.', errors }, { status }),
				{ once: true }
			)
		);
	}

	it('posts {} by default and returns the created player from the hold', async () => {
		mockStore.holdSignup(FRESH, {
			birthYear: 1990,
			birthMonth: 6,
			genderDivision: 'womens',
			firstName: 'Fern',
			lastName: 'Mock',
			city: '',
			region: ''
		});
		await signInFresh();
		const result = await createMyPlayer(undefined, { api });
		expect(result).toEqual({
			kind: 'created',
			player: { code: mockStore.playerOfAccount(FRESH)?.code, displayName: 'Fern Mock' }
		});
		expect(calls).toEqual([{ call: 'POST /api/v1/me/player', body: {} }]);
	});

	it('posts the details it is given', async () => {
		await signInFresh();
		const result = await createMyPlayer(details, { api });
		expect(result.kind).toBe('created');
		expect(calls).toEqual([{ call: 'POST /api/v1/me/player', body: details }]);
	});

	it('is a conflict when the account already has a player (409)', async () => {
		await signIn(VERIFIED_EMAIL);
		expect(await createMyPlayer(undefined, { api })).toEqual({ kind: 'conflict' });
	});

	it('needs details, with a message per field and no body. prefix, when they are missing', async () => {
		await signInFresh();
		expect(await createMyPlayer(undefined, { api })).toEqual({
			kind: 'needs-details',
			fields: {
				display_name: 'Enter a display name.',
				birth_year: 'Enter your birth year.',
				birth_month: 'Enter your birth month.',
				gender_division: 'Choose a gender division.'
			}
		});
	});

	it('is invalid, not needs-details, for a 422 with no missing item', async () => {
		await signInFresh();
		expect(await createMyPlayer({ ...details, gender_division: 'other' }, { api })).toEqual({
			kind: 'invalid',
			fields: { gender_division: 'Choose one of the listed options.' }
		});
	});

	it('needs details when any item is missing, with every field message', async () => {
		await signInFresh();
		answerPost(422, [
			{ field: 'body.display_name', code: 'missing', message: 'Enter a display name.' },
			{ field: 'body.birth_year', code: 'min_value', message: 'Too early.' }
		]);
		expect(await createMyPlayer(undefined, { api })).toEqual({
			kind: 'needs-details',
			fields: { display_name: 'Enter a display name.', birth_year: 'Too early.' }
		});
	});

	it('is refused for the age refusal, and for every later create in the session', async () => {
		await signInFresh();
		const child = { ...details, birth_year: new Date().getFullYear() - 5 };
		expect(await createMyPlayer(child, { api })).toEqual({ kind: 'refused' });
		expect(await createMyPlayer(details, { api })).toEqual({ kind: 'refused' });
	});

	it('matches the backend refusal text', () => {
		expect(AGE_REFUSAL_MESSAGE).toBe("This birth year and month can't be used.");
	});

	it('is not refused for another birth month error', async () => {
		await signInFresh();
		answerPost(422, [{ field: 'body.birth_month', code: 'invalid', message: 'Something else.' }]);
		expect(await createMyPlayer(details, { api })).toEqual({
			kind: 'invalid',
			fields: { birth_month: 'Something else.' }
		});
	});

	it.each([404, 405])("is 'unavailable' for a %i (an older backend)", async (status) => {
		await signInFresh();
		server.use(
			http.post('*/api/v1/me/player', () => new HttpResponse(null, { status }), { once: true })
		);
		expect(await createMyPlayer(undefined, { api })).toEqual({ kind: 'unavailable' });
	});

	it('throws a 401 when nobody is signed in', async () => {
		await expect(createMyPlayer(undefined, { api })).rejects.toMatchObject({
			kind: 'unauthenticated'
		});
	});

	it('throws a forbidden error for an unverified email (403)', async () => {
		await signInFresh();
		answerPost(403);
		await expect(createMyPlayer(undefined, { api })).rejects.toMatchObject({
			kind: 'forbidden',
			status: 403
		});
	});

	it('throws a server error for a 500', async () => {
		await signInFresh();
		answerPost(500);
		await expect(createMyPlayer(undefined, { api })).rejects.toMatchObject({ kind: 'server' });
	});

	it('throws a network error when there is no answer', async () => {
		await signInFresh();
		server.use(http.post('*/api/v1/me/player', () => HttpResponse.error(), { once: true }));
		await expect(createMyPlayer(undefined, { api })).rejects.toMatchObject({ kind: 'network' });
	});

	it('throws a server error for a created code that does not parse', async () => {
		await signInFresh();
		server.use(
			http.post(
				'*/api/v1/me/player',
				() =>
					HttpResponse.json(
						{ ...mockStore.myPlayerOut(mockStore.playerByCode(tamsin.code)!), code: '???' },
						{ status: 201 }
					),
				{ once: true }
			)
		);
		await expect(createMyPlayer(undefined, { api })).rejects.toMatchObject({ kind: 'server' });
	});
});
