/**
 * The real API client (`createApi`) against the mock handlers through msw/node. It is
 * the example later tests copy: `useMockApi()` once, a tiny cookie jar, then calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allauthParams, createApi, unwrap } from '../api';
import { buildCode } from '../domain/codes';
import { toMatchPage } from '../domain/mappers';
import { MOCK_KEYS, MOCK_PASSWORD, PLAYERS, UNVERIFIED_EMAIL, VERIFIED_EMAIL } from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';

useMockApi();

const BASE = 'http://localhost';
const code = (key: string) => PLAYERS.find((p) => p.key === key)?.code as string;
const tamsin = code('tamsin');

/** A browser stand-in: keeps the cookies the mock sets, as `document.cookie` would. */
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
	const api = createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
	return { api, jar };
}

type Api = ReturnType<typeof browser>['api'];

/** A made-up adult's sign-up details, without the email and password. */
const BORN = {
	birth_year: 1990,
	birth_month: 6,
	gender_division: 'mens',
	first_name: 'Sam',
	last_name: 'Rivera',
	accepted_terms: true,
	accepted_privacy: true
} as const;

async function login(api: Api, email = VERIFIED_EMAIL, password = MOCK_PASSWORD) {
	return api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password }
	});
}

const newMatch = {
	format: 'singles' as const,
	played_on: '2026-11-16',
	team_a: [tamsin],
	team_b: [code('kit')],
	games: [{ team_a: 11, team_b: 6 }]
};

describe('login, record a match, see it in the list', () => {
	it('works end to end with the real client', async () => {
		const { api } = browser();
		await api.initCsrf();

		const signedOut = await api.allauth.GET('/_allauth/{client}/v1/auth/session', {
			params: allauthParams
		});
		expect(signedOut.response.status).toBe(401);

		const loggedIn = await login(api);
		expect(loggedIn.response.status).toBe(200);
		expect(loggedIn.data?.data.user.email).toBe(VERIFIED_EMAIL);

		const before = toMatchPage(
			await unwrap(
				api.open.GET('/api/v1/players/{code}/matches', {
					params: { path: { code: tamsin }, query: { limit: 100 } }
				})
			)
		);

		const created = await unwrap(api.open.POST('/api/v1/matches/', { body: newMatch }));
		expect(created.status).toBe('pending');
		expect(created.best_of).toBe(1);

		const after = toMatchPage(
			await unwrap(
				api.open.GET('/api/v1/players/{code}/matches', {
					params: { path: { code: tamsin }, query: { limit: 100 } }
				})
			)
		);
		expect(after.count).toBe(before.count + 1);
		expect(after.items[0].code).toBe(created.code);
		expect(after.items[0].playedOn).toBe('2026-11-16');
		expect(after.items[0].teamB.players[0].displayName).toBe('Kit Ashdown');
	});

	it('confirms for both teams and the status follows', async () => {
		const mine = browser();
		await login(mine.api);
		const created = await unwrap(mine.api.open.POST('/api/v1/matches/', { body: newMatch }));
		const path = { params: { path: { code: created.code } } };

		const first = await unwrap(mine.api.open.POST('/api/v1/matches/{code}/confirm', path));
		expect(first.status).toBe('pending');

		// The other side signs in as itself and confirms.
		mockStore.logout();
		const theirs = browser();
		await login(theirs.api, 'kit@example.com');
		const second = await unwrap(theirs.api.open.POST('/api/v1/matches/{code}/confirm', path));
		expect(second.status).toBe('confirmed');
	});

	it('disputes, then refuses to confirm (409)', async () => {
		const { api } = browser();
		await login(api);
		const created = await unwrap(api.open.POST('/api/v1/matches/', { body: newMatch }));
		const path = { params: { path: { code: created.code } } };
		const disputed = await unwrap(api.open.POST('/api/v1/matches/{code}/dispute', path));
		expect(disputed.status).toBe('disputed');
		const again = await api.open.POST('/api/v1/matches/{code}/confirm', path);
		expect(again.response.status).toBe(409);
		expect(again.error).toMatchObject({ code: 'conflict', errors: [] });
	});
});

describe('the backend rules', () => {
	it('answers 401 before anything else when signed out', async () => {
		const { api } = browser();
		const result = await api.open.POST('/api/v1/matches/', { body: newMatch });
		expect(result.response.status).toBe(401);
		expect(result.error).toEqual({
			code: 'unauthorized',
			message: 'Authentication required.',
			errors: []
		});
	});

	it('returns the 422 shape ninja sends for a bad score', async () => {
		const { api } = browser();
		await login(api);
		const result = await api.open.POST('/api/v1/matches/', {
			body: { ...newMatch, games: [{ team_a: 11, team_b: 11 }] }
		});
		expect(result.response.status).toBe(422);
		expect(result.error).toMatchObject({
			code: 'validation_error',
			message: 'The request is not valid.',
			errors: [{ field: 'body.games.0', code: 'tie' }]
		});
	});

	it('returns pydantic style errors for a malformed body', async () => {
		const { api } = browser();
		await login(api);
		const result = await api.open.POST('/api/v1/matches/', {
			body: { format: 'triples' } as never
		});
		expect(result.response.status).toBe(422);
		const fields = result.error?.errors.map((e) => e.field);
		expect(fields).toEqual([
			'body.format',
			'body.played_on',
			'body.team_a',
			'body.team_b',
			'body.games'
		]);
	});

	it('returns 409 duplicate_match naming the earlier match', async () => {
		const { api } = browser();
		await login(api);
		const first = await unwrap(api.open.POST('/api/v1/matches/', { body: newMatch }));
		const again = await api.open.POST('/api/v1/matches/', { body: newMatch });
		expect(again.response.status).toBe(409);
		expect(again.error).toMatchObject({
			code: 'duplicate_match',
			message: `This match was already submitted as ${first.code}.`,
			errors: [{ field: 'match', code: 'duplicate_match' }]
		});
	});

	it('refuses a submitter who is not in the match (403) and unknown players (422)', async () => {
		const { api } = browser();
		await login(api);
		const notMe = await api.open.POST('/api/v1/matches/', {
			body: { ...newMatch, team_a: [code('oren')] }
		});
		expect(notMe.response.status).toBe(403);
		expect(notMe.error).toMatchObject({ code: 'forbidden', errors: [] });

		const unknown = await api.open.POST('/api/v1/matches/', {
			body: { ...newMatch, team_b: ['P-AAAA-AAAA'] }
		});
		expect(unknown.response.status).toBe(422);
		expect(unknown.error?.errors).toEqual([
			{ field: 'body.team_b.0', code: 'unknown_player', message: 'No player has this OPEN Code.' }
		]);
	});

	it('gives a 404 for a match the player was not in', async () => {
		const { api } = browser();
		await login(api);
		const other = mockStore.state.matches.find((m) => !m.teamA.concat(m.teamB).includes(tamsin));
		const result = await api.open.POST('/api/v1/matches/{code}/confirm', {
			params: { path: { code: other?.code as string } }
		});
		expect(result.response.status).toBe(404);
		expect(result.error).toMatchObject({ code: 'not_found', message: 'Not found.' });
	});

	describe('get_match', () => {
		const WAITING_ON_TAMSIN = buildCode('match', '7QK2H9WD3NF');
		const BETWEEN_OTHERS = buildCode('match', 'C4VD8RME2TX');

		it('answers 401 when signed out', async () => {
			const { api } = browser();
			const result = await api.open.GET('/api/v1/matches/{code}', {
				params: { path: { code: WAITING_ON_TAMSIN } }
			});
			expect(result.response.status).toBe(401);
		});

		it("gives a player their match with that player's viewer fields", async () => {
			const tamsinApi = browser().api;
			await login(tamsinApi);
			const mine = await unwrap(
				tamsinApi.open.GET('/api/v1/matches/{code}', {
					params: { path: { code: WAITING_ON_TAMSIN } }
				})
			);
			expect(mine.code).toBe(WAITING_ON_TAMSIN);
			expect(mine.my_team).toBe('A');

			// The mock backend has one session at a time: sign Tamsin out first.
			mockStore.logout();
			const beaApi = browser().api;
			await login(beaApi, 'bea@example.com');
			const hers = await unwrap(
				beaApi.open.GET('/api/v1/matches/{code}', { params: { path: { code: WAITING_ON_TAMSIN } } })
			);
			expect(hers.my_team).toBe('B');
			expect(hers.my_decision).toBe('confirm');
		});

		it('reads a match in any status, and with the prefix or hyphens left off', async () => {
			const { api } = browser();
			await login(api);
			const disputed = mockStore.state.matches.find((m) => m.status === 'disputed');
			const result = await unwrap(
				api.open.GET('/api/v1/matches/{code}', {
					params: { path: { code: (disputed?.code as string).toLowerCase().replaceAll('-', '') } }
				})
			);
			expect(result.status).toBe('disputed');
		});

		it('gives the same 404 for a match the player was not in, an unknown code and a bad code', async () => {
			const { api } = browser();
			await login(api);
			const bodies = [];
			for (const code of [BETWEEN_OTHERS, 'M-0000-0000-000', 'not-a-code']) {
				const result = await api.open.GET('/api/v1/matches/{code}', { params: { path: { code } } });
				expect(result.response.status).toBe(404);
				bodies.push(result.error);
			}
			expect(bodies[1]).toEqual(bodies[0]);
			expect(bodies[2]).toEqual(bodies[0]);
			expect(bodies[0]).toMatchObject({ code: 'not_found' });
		});

		it('keeps another signed-in account out of a match', async () => {
			const { api } = browser();
			await login(api, 'rosa@example.com');
			const result = await api.open.GET('/api/v1/matches/{code}', {
				params: { path: { code: WAITING_ON_TAMSIN } }
			});
			expect(result.response.status).toBe(404);
		});
	});

	it('pages the list with limit and offset, and rejects a bad limit', async () => {
		const { api } = browser();
		await login(api);
		const path = { code: tamsin };
		const one = await unwrap(
			api.open.GET('/api/v1/players/{code}/matches', { params: { path, query: { limit: 20 } } })
		);
		const two = await unwrap(
			api.open.GET('/api/v1/players/{code}/matches', {
				params: { path, query: { limit: 20, offset: 20 } }
			})
		);
		expect(one.items).toHaveLength(20);
		expect(two.items.length).toBeGreaterThan(0);
		expect(two.count).toBe(one.count);
		expect(new Set([...one.items, ...two.items].map((m) => m.code)).size).toBe(
			one.items.length + two.items.length
		);
		const bad = await api.open.GET('/api/v1/players/{code}/matches', {
			params: { path, query: { limit: 0 } }
		});
		expect(bad.response.status).toBe(422);
		expect(bad.error?.errors[0]).toMatchObject({
			field: 'query.limit',
			code: 'greater_than_equal'
		});
	});

	it('shows others only confirmed matches, hides private histories, and masks the private player', async () => {
		const { api } = browser();
		await login(api);
		const oren = await unwrap(
			api.open.GET('/api/v1/players/{code}/matches', {
				params: { path: { code: code('oren') }, query: { limit: 100 } }
			})
		);
		expect(oren.items.every((m) => m.status === 'confirmed')).toBe(true);

		const nell = await api.open.GET('/api/v1/players/{code}/matches', {
			params: { path: { code: code('nell') } }
		});
		expect(nell.response.status).toBe(404);
		const malformed = await api.open.GET('/api/v1/players/{code}/matches', {
			params: { path: { code: 'nonsense' } }
		});
		expect(malformed.response.status).toBe(404);

		const mine = toMatchPage(
			await unwrap(
				api.open.GET('/api/v1/players/{code}/matches', {
					params: { path: { code: tamsin }, query: { limit: 100 } }
				})
			)
		);
		const names = mine.items.flatMap((m) => [...m.teamA.players, ...m.teamB.players]);
		expect(names.some((p) => p.displayName === 'Saul Pemberly')).toBe(false);
		expect(
			names.filter((p) => p.code === null).every((p) => p.displayName === 'Private player')
		).toBe(true);
		expect(names.some((p) => p.code === null)).toBe(true);
	});
});

describe('CSRF', () => {
	it('sets the csrftoken cookie on config', async () => {
		const { api, jar } = browser();
		await api.allauth.GET('/_allauth/{client}/v1/config', { params: allauthParams });
		expect(jar.get('csrftoken')).toBeTruthy();
	});

	it('refuses an unsafe allauth request without the header (Django HTML 403)', async () => {
		const response = await fetch(`${BASE}/_allauth/browser/v1/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD })
		});
		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toContain('text/html');
	});

	it('refuses a signed-in OPEN API write without the header (ninja 403)', async () => {
		const { api } = browser();
		await login(api);
		const response = await fetch(`${BASE}/api/v1/matches/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(newMatch)
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			code: 'forbidden',
			message: 'CSRF check Failed',
			errors: []
		});
	});
});

describe('accounts', () => {
	it('gives the account its email', async () => {
		const { api } = browser();
		await login(api);
		expect((await unwrap(api.open.GET('/api/v1/accounts/me'))).email).toBe(VERIFIED_EMAIL);
	});

	it('rejects a wrong password with the allauth error shape', async () => {
		const { api } = browser();
		const result = await login(api, VERIFIED_EMAIL, 'wrong-password');
		expect(result.response.status).toBe(400);
		expect(result.error).toMatchObject({
			status: 400,
			errors: [{ code: 'email_password_mismatch', param: 'password' }]
		});
	});

	it('answers an unverified login with a 401 and the verify_email flow', async () => {
		const { api } = browser();
		const result = await login(api, UNVERIFIED_EMAIL);
		expect(result.response.status).toBe(401);
		expect(result.error).toMatchObject({
			status: 401,
			data: { flows: expect.arrayContaining([{ id: 'verify_email', is_pending: true }]) },
			meta: { is_authenticated: false }
		});
	});

	it('signs up, verifies by link, then logs in', async () => {
		const { api } = browser();
		const email = 'new.player@example.com';
		const signup = await api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: { ...BORN, email, password: 'a-fine-password-9' }
		});
		expect(signup.response.status).toBe(401);
		expect(await login(api, email, 'a-fine-password-9').then((r) => r.response.status)).toBe(401);

		const key = mockStore.state.outbox.findLast((m) => m.kind === 'verify_email')?.key as string;
		const info = await fetch(`${BASE}/_allauth/browser/v1/auth/email/verify`, {
			headers: { 'X-Email-Verification-Key': key }
		});
		expect(info.status).toBe(200);
		const verify = await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key }
		});
		// The backend does not log in on verification.
		expect(verify.response.status).toBe(401);
		expect((await login(api, email, 'a-fine-password-9')).response.status).toBe(200);
	});

	it('checks the password rules and the email on sign-up', async () => {
		const { api } = browser();
		const result = await api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: { ...BORN, email: 'not-an-email', password: '123' }
		});
		expect(result.response.status).toBe(400);
		const params = (result.error as { errors: { param: string; code: string }[] }).errors;
		expect(params.map((e) => e.param)).toEqual(['email', 'password', 'password']);
	});

	/** A sign-up POST with a raw body, so the tests can send what the typed client won't. */
	async function signupRaw(api: Api, body: Record<string, unknown>) {
		const result = await api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: body as never
		});
		return {
			status: result.response.status,
			errors: (result.error as { errors?: { param?: string; code: string; message: string }[] })
				?.errors
		};
	}

	const valid = { ...BORN, email: 'new.player@example.com', password: 'a-fine-password-9' };

	it('asks for the birth year and month and the division, before the email', async () => {
		const { api } = browser();
		const result = await signupRaw(api, { email: 'not-an-email', password: '123' });
		expect(result.status).toBe(400);
		expect(result.errors).toEqual([
			{ code: 'required', message: 'Enter your birth year.', param: 'birth_year' },
			{ code: 'required', message: 'Enter your birth month.', param: 'birth_month' },
			{ code: 'required', message: 'Choose a gender division.', param: 'gender_division' },
			{ code: 'required', message: 'Enter your first name.', param: 'first_name' },
			{ code: 'required', message: 'Enter your last name.', param: 'last_name' },
			{ code: 'required', message: 'Accept the Terms of Service.', param: 'accepted_terms' },
			{ code: 'required', message: 'Accept the Privacy Policy.', param: 'accepted_privacy' }
		]);
	});

	const CONTROL = 'Remove control or invalid characters.';
	const NAME_TOGETHER = 'Your first and last name together can be at most 63 characters.';
	it.each([
		[{ first_name: undefined }, 'first_name', 'required', 'Enter your first name.'],
		[{ last_name: '' }, 'last_name', 'required', 'Enter your last name.'],
		[{ first_name: '   ' }, 'first_name', 'required', 'Enter your first name.'],
		[{ last_name: '​' }, 'last_name', 'required', 'Enter your last name.'],
		[{ first_name: 'ㅤ' }, 'first_name', 'required', 'Enter your first name.'],
		[{ last_name: '́' }, 'last_name', 'required', 'Enter your last name.'],
		[{ first_name: '​\n​' }, 'first_name', 'invalid', CONTROL],
		[{ first_name: 42 }, 'first_name', 'invalid', 'Enter text.'],
		[{ last_name: null }, 'last_name', 'required', 'Enter your last name.'],
		[{ first_name: 'Sa\u0007m' }, 'first_name', 'invalid', CONTROL],
		[{ last_name: 'Riv\u0085era' }, 'last_name', 'invalid', CONTROL],
		[
			{ first_name: 'a'.repeat(62) },
			'first_name',
			'max_length',
			'Your first name can be at most 61 characters.'
		],
		[{ first_name: 'a'.repeat(61), last_name: 'bbb' }, 'last_name', 'max_length', NAME_TOGETHER],
		[{ first_name: 'a', last_name: 'b'.repeat(64) }, 'last_name', 'max_length', NAME_TOGETHER],
		[{ city: 7 }, 'city', 'invalid', 'Enter text.'],
		[{ region: false }, 'region', 'invalid', 'Enter text.'],
		[{ city: 'c'.repeat(101) }, 'city', 'max_length', 'Enter at most 100 characters.'],
		[{ region: 'r'.repeat(101) }, 'region', 'max_length', 'Enter at most 100 characters.'],
		[{ accepted_terms: false }, 'accepted_terms', 'required', 'Accept the Terms of Service.'],
		[{ accepted_terms: 'true' }, 'accepted_terms', 'required', 'Accept the Terms of Service.'],
		[{ accepted_privacy: false }, 'accepted_privacy', 'required', 'Accept the Privacy Policy.'],
		[{ accepted_privacy: 'true' }, 'accepted_privacy', 'required', 'Accept the Privacy Policy.']
	])('refuses %j on its field', async (override, param, code, message) => {
		const { api } = browser();
		const result = await signupRaw(api, { ...valid, ...override });
		expect(result.status).toBe(400);
		expect(result.errors).toEqual([{ code, message, param }]);
	});

	it.each([
		['61 and 1 characters (62 together)', 'a'.repeat(61), 'b'],
		['1 and 62 characters (63 together)', 'a', 'b'.repeat(62)],
		['padded names are stripped first', `  ${'a'.repeat(61)}  `, ' b ']
	])('accepts names at the limit: %s', async (_name, first_name, last_name) => {
		const { api } = browser();
		const result = await signupRaw(api, { ...valid, first_name, last_name });
		expect(result.status).toBe(401);
	});

	it('counts code points, not UTF-16 units, in a name', async () => {
		const ball = String.fromCodePoint(0x1f3d3);
		const { api } = browser();
		const ok = await signupRaw(api, { ...valid, first_name: ball.repeat(61), last_name: 'b' });
		expect(ok.status).toBe(401);
		const { api: other } = browser();
		const tooLong = await signupRaw(other, { ...valid, first_name: ball.repeat(62) });
		expect(tooLong.errors?.map((e) => e.param)).toEqual(['first_name']);
	});

	it('accepts a body with a city and region, and a body with neither, and holds them for the create', async () => {
		const { api } = browser();
		const withPlace = await signupRaw(api, { ...valid, city: 'Riverbend', region: 'Ohio' });
		expect(withPlace.status).toBe(401);
		expect(mockStore.state.signupHold).toMatchObject({ city: 'Riverbend', region: 'Ohio' });
		const { api: other } = browser();
		const without = await signupRaw(other, { ...valid, email: 'other.player@example.com' });
		expect(without.status).toBe(401);
	});

	it('reports the age group together, before the refusal and the email', async () => {
		const { api } = browser();
		const result = await signupRaw(api, {
			...valid,
			email: 'bad',
			birth_year: new Date().getFullYear() - 5,
			first_name: '',
			accepted_privacy: false
		});
		expect(result.errors?.map((e) => e.param)).toEqual(['first_name', 'accepted_privacy']);
		// No refusal was set, so a good body still goes through.
		expect((await signupRaw(api, valid)).status).toBe(401);
	});

	it.each([
		[{ birth_year: 'abc' }, 'birth_year', 'invalid', 'Enter a whole number.'],
		[{ birth_year: 1990.5 }, 'birth_year', 'invalid', 'Enter a whole number.'],
		[{ birth_year: 1899 }, 'birth_year', 'min_value', 'Enter a birth year of 1900 or later.'],
		[{ birth_month: 'June' }, 'birth_month', 'invalid', 'Enter a whole number.'],
		[{ birth_month: 0 }, 'birth_month', 'min_value', 'Enter a month from 1 to 12.'],
		[{ birth_month: 13 }, 'birth_month', 'max_value', 'Enter a month from 1 to 12.'],
		[
			{ gender_division: 'mixed' },
			'gender_division',
			'invalid_choice',
			'Choose one of the listed options.'
		]
	])('refuses %j on its field', async (override, param, code, message) => {
		const { api } = browser();
		const result = await signupRaw(api, { ...valid, ...override });
		expect(result.status).toBe(400);
		expect(result.errors).toEqual([{ code, message, param }]);
	});

	it('takes the year and month as numeric strings, as the backend form does', async () => {
		const { api } = browser();
		const result = await signupRaw(api, { ...valid, birth_year: '1990', birth_month: '6' });
		expect(result.status).toBe(401);
	});

	it('refuses an age under 13 with one fixed answer and no field, and sends no mail', async () => {
		const { api } = browser();
		const result = await signupRaw(api, { ...valid, birth_year: new Date().getFullYear() - 5 });
		expect(result.status).toBe(400);
		expect(result.errors).toEqual([
			{ code: 'signup_refused', message: "We can't create an account with these details." }
		]);
		expect(mockStore.state.outbox).toEqual([]);
		expect(mockStore.accountByEmail(valid.email)).toBeUndefined();
	});

	describe('13 from the last day of the birth month, on the date at UTC-12', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it.each([
			// Born June 2013: 13 on 30 June 2026, once that date has begun at UTC-12.
			['the day before the last day', '2026-06-30T11:59:00Z', 2013, 6, 'refused'],
			['the last day, at UTC-12', '2026-06-30T12:00:00Z', 2013, 6, 'accepted'],
			['the last day, late UTC', '2026-07-01T11:00:00Z', 2013, 6, 'accepted'],
			// Born February 2012, a leap year: the last day is the 29th, so 13 only from 1 March 2025.
			['28 February after a leap-year February birth', '2025-03-01T11:59:00Z', 2012, 2, 'refused'],
			['1 March after a leap-year February birth', '2025-03-01T12:00:00Z', 2012, 2, 'accepted'],
			// Before 12:00 UTC on 1 January it is still 31 December at UTC-12.
			[
				'1 January before 12:00 UTC, born the next January',
				'2026-01-01T11:00:00Z',
				2013,
				1,
				'refused'
			],
			[
				'1 January before 12:00 UTC, born the December before',
				'2026-01-01T11:00:00Z',
				2012,
				12,
				'accepted'
			]
		])('%s', async (_name, now, birthYear, birthMonth, outcome) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(now));
			const { api } = browser();
			const result = await signupRaw(api, {
				...valid,
				birth_year: birthYear,
				birth_month: birthMonth
			});
			if (outcome === 'accepted') {
				expect(result.status).toBe(401);
			} else {
				expect(result.errors).toEqual([
					{ code: 'signup_refused', message: "We can't create an account with these details." }
				]);
			}
		});
	});

	it('keeps refusing in the same session after an under-13 answer, whatever is sent', async () => {
		const { api } = browser();
		await signupRaw(api, { ...valid, birth_year: new Date().getFullYear() - 5 });
		const again = await signupRaw(api, valid);
		expect(again.status).toBe(400);
		expect(again.errors).toEqual([
			{ code: 'signup_refused', message: "We can't create an account with these details." }
		]);
	});

	it('signs up a player who is 13 or older', async () => {
		const { api } = browser();
		const result = await signupRaw(api, {
			...valid,
			birth_year: new Date().getUTCFullYear() - 14,
			birth_month: 12
		});
		expect(result.status).toBe(401);
	});

	it('rejects an unknown verification key and lets a seeded one through', async () => {
		const { api } = browser();
		const bad = await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key: 'nope' }
		});
		expect(bad.response.status).toBe(400);
		const good = await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key: MOCK_KEYS.verifyEmail }
		});
		expect(good.response.status).toBe(401);
		expect((await login(api, UNVERIFIED_EMAIL)).response.status).toBe(200);
	});

	it('answers resend with a 409, as the backend does with verification by link', async () => {
		const { api } = browser();
		const result = await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify/resend', {
			params: allauthParams
		});
		expect(result.response.status).toBe(409);
	});

	it('requests and completes a password reset', async () => {
		const { api } = browser();
		const request = await api.allauth.POST('/_allauth/{client}/v1/auth/password/request', {
			params: allauthParams,
			body: { email: VERIFIED_EMAIL }
		});
		expect(request.response.status).toBe(200);
		// An unknown address gets the same answer.
		const unknown = await api.allauth.POST('/_allauth/{client}/v1/auth/password/request', {
			params: allauthParams,
			body: { email: 'nobody@example.com' }
		});
		expect(unknown.response.status).toBe(200);
		const key = mockStore.state.outbox.findLast((m) => m.kind === 'reset_password')?.key as string;
		expect(key).toBeTruthy();

		const reset = await api.allauth.POST('/_allauth/{client}/v1/auth/password/reset', {
			params: allauthParams,
			body: { key, password: 'a-brand-new-pass-7' }
		});
		expect(reset.response.status).toBe(401);
		expect((await login(api, VERIFIED_EMAIL, MOCK_PASSWORD)).response.status).toBe(400);
		expect((await login(api, VERIFIED_EMAIL, 'a-brand-new-pass-7')).response.status).toBe(200);

		const reuse = await api.allauth.POST('/_allauth/{client}/v1/auth/password/reset', {
			params: allauthParams,
			body: { key, password: 'another-pass-77' }
		});
		expect(reuse.response.status).toBe(400);
	});

	it('logs out', async () => {
		const { api } = browser();
		await login(api);
		const out = await api.allauth.DELETE('/_allauth/{client}/v1/auth/session', {
			params: allauthParams
		});
		expect(out.response.status).toBe(401);
		expect((await api.open.GET('/api/v1/accounts/me')).response.status).toBe(401);
	});
});

describe('player profile endpoints', () => {
	const tamsinFixture = PLAYERS.find((p) => p.key === 'tamsin') as (typeof PLAYERS)[number];
	const FRESH = 'fresh@example.com';
	const adult = {
		display_name: 'Fern Mock',
		birth_year: 1990,
		birth_month: 6,
		gender_division: 'womens'
	};
	const AGE_REFUSAL = [
		{
			field: 'body.birth_month',
			code: 'invalid',
			message: "This birth year and month can't be used."
		}
	];

	/** A signed-in, verified account with no player yet. */
	async function freshAccount() {
		mockStore.state.accounts.push({
			email: FRESH,
			password: MOCK_PASSWORD,
			verified: true,
			active: true
		});
		const { api } = browser();
		await api.initCsrf();
		expect((await login(api, FRESH)).response.status).toBe(200);
		return api;
	}

	async function signedIn(email = VERIFIED_EMAIL) {
		const { api } = browser();
		await api.initCsrf();
		expect((await login(api, email)).response.status).toBe(200);
		return api;
	}

	const fields = (error: unknown) =>
		(error as { errors: { field: string; code: string }[] }).errors.map((e) => [e.field, e.code]);

	it('answers 401 without a session on all four, before anything else', async () => {
		const { api } = browser();
		const results = await Promise.all([
			api.open.GET('/api/v1/me/player'),
			api.open.POST('/api/v1/me/player', { body: { made_up: 1 } as never }),
			api.open.PATCH('/api/v1/me/player', { body: { made_up: 1 } as never }),
			api.open.GET('/api/v1/players/{code}', { params: { path: { code: tamsin } } })
		]);
		for (const result of results) {
			expect(result.response.status).toBe(401);
			expect(result.error).toMatchObject({ code: 'unauthorized' });
		}
	});

	it('needs a CSRF token to create or change the player (403)', async () => {
		await signedIn();
		for (const method of ['POST', 'PATCH']) {
			const response = await fetch(`${BASE}/api/v1/me/player`, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			expect(response.status, method).toBe(403);
		}
	});

	it('reads the own player with every MyPlayerOut field and no home club', async () => {
		const api = await signedIn();
		const own = await unwrap(api.open.GET('/api/v1/me/player'));
		expect(own).toEqual({
			code: tamsin,
			display_name: tamsinFixture.displayName,
			legal_name: tamsinFixture.legalName,
			birth_year: tamsinFixture.birthYear,
			birth_month: tamsinFixture.birthMonth,
			gender_division: tamsinFixture.genderDivision,
			city: tamsinFixture.city,
			region: tamsinFixture.region,
			privacy: tamsinFixture.privacy
		});
		expect(own).not.toHaveProperty('home_club');
	});

	it('is a 404 for an account with no player', async () => {
		const api = await freshAccount();
		const own = await api.open.GET('/api/v1/me/player');
		expect(own.response.status).toBe(404);
		expect(own.error).toEqual({ code: 'not_found', message: 'Not found.', errors: [] });
	});

	it('creates the player from the body, with empty optional text as ""', async () => {
		const api = await freshAccount();
		const made = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, city: ' Vexmoor ' }
		});
		expect(made.response.status).toBe(201);
		expect(made.data).toMatchObject({
			display_name: 'Fern Mock',
			legal_name: '',
			birth_year: 1990,
			birth_month: 6,
			gender_division: 'womens',
			city: 'Vexmoor',
			region: '',
			privacy: {
				city_region_visibility: 'signed_in',
				match_history_visibility: 'signed_in',
				rating_history_visibility: 'signed_in',
				stats_visibility: 'signed_in',
				home_club_visibility: 'signed_in',
				rating_visibility: 'signed_in'
			}
		});
		expect(made.data?.code).toMatch(/^P-/);
		expect(await unwrap(api.open.GET('/api/v1/me/player'))).toEqual(made.data);
	});

	it.each(['display_name', 'birth_year', 'birth_month', 'gender_division'] as const)(
		'needs %s to create the player (422)',
		async (name) => {
			const api = await freshAccount();
			const body: Record<string, unknown> = { ...adult };
			delete body[name];
			const result = await api.open.POST('/api/v1/me/player', { body });
			expect(result.response.status).toBe(422);
			expect(fields(result.error)).toEqual([[`body.${name}`, 'missing']]);
			expect(mockStore.playerOfAccount(FRESH)).toBeUndefined();
		}
	);

	it('refuses an unknown key and a made-up gender division (422)', async () => {
		const api = await freshAccount();
		const unknown = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, account: 1 } as never
		});
		expect(unknown.response.status).toBe(422);
		expect(fields(unknown.error)).toEqual([['body.account', 'extra_forbidden']]);

		const division = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, gender_division: 'made-up' }
		});
		expect(division.response.status).toBe(422);
		expect(division.error?.errors).toEqual([
			{
				field: 'body.gender_division',
				code: 'invalid_choice',
				message: 'Choose one of the listed options.'
			}
		]);
		expect(mockStore.playerOfAccount(FRESH)).toBeUndefined();
	});

	it('refuses an under-13 age with the fixed 422, and keeps refusing in the session', async () => {
		const api = await freshAccount();
		const child = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, birth_year: new Date().getFullYear() - 5 }
		});
		expect(child.response.status).toBe(422);
		expect(child.error?.errors).toEqual(AGE_REFUSAL);
		expect(mockStore.state.signupRefused).toBe(true);

		const again = await api.open.POST('/api/v1/me/player', { body: adult });
		expect(again.response.status).toBe(422);
		expect(again.error?.errors).toEqual(AGE_REFUSAL);
		expect(mockStore.playerOfAccount(FRESH)).toBeUndefined();
	});

	it('refuses a birth month in the future the same way', async () => {
		const api = await freshAccount();
		const future = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, birth_year: new Date().getFullYear() + 1 }
		});
		expect(future.response.status).toBe(422);
		expect(future.error?.errors).toEqual(AGE_REFUSAL);
		expect(mockStore.state.signupRefused).toBe(true);
	});

	// Django's full_clean runs the age rule even when a field failed, and create_my_player
	// checks the age refusal before it reports field errors.
	it.each([
		['a blank display name', { display_name: '   ' }],
		['a made-up gender division', { gender_division: 'other' }],
		['a legal name that is too long', { legal_name: 'Q'.repeat(201) }]
	])('refuses a child with %s by age alone, for the rest of the session', async (_, extra) => {
		const api = await freshAccount();
		const child = await api.open.POST('/api/v1/me/player', {
			body: { ...adult, ...extra, birth_year: new Date().getFullYear() - 5 }
		});
		expect(child.response.status).toBe(422);
		expect(child.error?.errors).toEqual(AGE_REFUSAL);
		expect(mockStore.state.signupRefused).toBe(true);

		const again = await api.open.POST('/api/v1/me/player', { body: adult });
		expect(again.error?.errors).toEqual(AGE_REFUSAL);
		expect(mockStore.playerOfAccount(FRESH)).toBeUndefined();
	});

	it('starts a player aged 13 to 17 with every privacy setting private', async () => {
		const api = await freshAccount();
		const made = await unwrap(
			api.open.POST('/api/v1/me/player', {
				body: {
					...adult,
					birth_year: new Date().getFullYear() - 15,
					birth_month: 1,
					city: 'Quillbury',
					region: 'Norvane'
				}
			})
		);
		expect(made.privacy).toEqual({
			city_region_visibility: 'private',
			match_history_visibility: 'private',
			rating_history_visibility: 'private',
			stats_visibility: 'private',
			home_club_visibility: 'private',
			rating_visibility: 'private'
		});

		mockStore.logout();
		const other = await signedIn('oren@example.com');
		const seen = await other.open.GET('/api/v1/players/{code}', {
			params: { path: { code: made.code } }
		});
		expect(seen.data).toMatchObject({ city: null, region: null });
	});

	it('refuses a second player for the account (409)', async () => {
		const api = await signedIn();
		const second = await api.open.POST('/api/v1/me/player', { body: adult });
		expect(second.response.status).toBe(409);
		expect(second.error).toEqual({
			code: 'conflict',
			message: 'This account already has a player.',
			errors: []
		});
	});

	it('changes only the fields sent', async () => {
		const api = await signedIn();
		const before = await unwrap(api.open.GET('/api/v1/me/player'));
		const patched = await unwrap(
			api.open.PATCH('/api/v1/me/player', {
				body: { display_name: '  Tam V. ', privacy: { stats_visibility: 'private' } }
			})
		);
		expect(patched).toEqual({
			...before,
			display_name: 'Tam V.',
			privacy: { ...before.privacy, stats_visibility: 'private' }
		});
	});

	it("accepts the player's stored rating_visibility", async () => {
		const api = await signedIn();
		const before = await unwrap(api.open.GET('/api/v1/me/player'));
		const patched = await unwrap(
			api.open.PATCH('/api/v1/me/player', {
				body: { privacy: { rating_visibility: before.privacy.rating_visibility } }
			})
		);
		expect(patched).toEqual(before);
	});

	it('refuses to show the current ratings of a player aged 13 to 17', async () => {
		const api = await freshAccount();
		await unwrap(
			api.open.POST('/api/v1/me/player', {
				body: { ...adult, birth_year: new Date().getFullYear() - 15, birth_month: 1 }
			})
		);
		const result = await api.open.PATCH('/api/v1/me/player', {
			body: { privacy: { rating_visibility: 'signed_in' } }
		});
		expect(result.response.status).toBe(422);
		expect(result.error?.errors).toEqual([
			{
				field: 'body.privacy.rating_visibility',
				code: 'invalid',
				message: 'Current ratings can be shown to other players only from age 18.'
			}
		]);
	});

	it('clears the city, region and legal name with null', async () => {
		const api = await signedIn();
		const patched = await unwrap(
			api.open.PATCH('/api/v1/me/player', {
				body: { city: null, region: null, legal_name: null }
			})
		);
		expect(patched).toMatchObject({ city: '', region: '', legal_name: '' });
	});

	it.each([
		[{ birth_year: 1990 }, [['body.birth_year', 'set_once']]],
		[{ birth_month: 6 }, [['body.birth_month', 'set_once']]],
		[{ gender_division: null }, [['body.gender_division', 'set_once']]],
		[{ made_up: 'x' }, [['body.made_up', 'extra_forbidden']]],
		[{ privacy: { made_up: 'private' } }, [['body.privacy.made_up', 'extra_forbidden']]],
		[
			{ display_name: null },
			[
				['body.display_name', 'null'],
				['body.display_name', 'invalid']
			]
		],
		[
			{ display_name: '   ' },
			[
				['body.display_name', 'blank'],
				['body.display_name', 'invalid']
			]
		],
		[
			{ display_name: 'Fine Name', privacy: { stats_visibility: 'everyone' } },
			[['body.privacy.stats_visibility', 'enum']]
		],
		[
			{ privacy: { rating_visibility: 'private', stats_visibility: 'private' } },
			[['body.privacy.rating_visibility', 'invalid']]
		]
	])('refuses %j with a 422 that changes nothing', async (body, expected) => {
		const api = await signedIn();
		const before = await unwrap(api.open.GET('/api/v1/me/player'));
		const result = await api.open.PATCH('/api/v1/me/player', { body: body as never });
		expect(result.response.status).toBe(422);
		expect(result.error?.code).toBe('validation_error');
		expect(fields(result.error)).toEqual(expected);
		expect(await unwrap(api.open.GET('/api/v1/me/player'))).toEqual(before);
	});

	// JSON.parse makes each of these an own key, including __proto__.
	it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
		'refuses the unknown key %s on PATCH (422 extra_forbidden)',
		async (key) => {
			const api = await signedIn();
			const before = await unwrap(api.open.GET('/api/v1/me/player'));
			const response = await fetch(`${BASE}/api/v1/me/player`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRFToken': mockStore.state.csrfToken
				},
				body: `{"${key}": 1}`
			});
			expect(response.status).toBe(422);
			expect(fields(await response.json())).toEqual([[`body.${key}`, 'extra_forbidden']]);
			expect(await unwrap(api.open.GET('/api/v1/me/player'))).toEqual(before);
		}
	);

	it('is a 404 to change an account with no player', async () => {
		const api = await freshAccount();
		const result = await api.open.PATCH('/api/v1/me/player', { body: { city: 'Vexmoor' } });
		expect(result.response.status).toBe(404);
	});

	describe('a public profile', () => {
		const profile = (api: Api, path = tamsin) =>
			api.open.GET('/api/v1/players/{code}', { params: { path: { code: path } } });

		it('shows the code, name, city and region to another signed-in player', async () => {
			const api = await signedIn('oren@example.com');
			expect((await profile(api)).data).toEqual({
				code: tamsin,
				display_name: tamsinFixture.displayName,
				city: tamsinFixture.city,
				region: tamsinFixture.region
			});
		});

		it('hides the city and region when the setting is private, but not from the owner', async () => {
			const player = mockStore.playerByCode(tamsin);
			if (player) player.privacy.city_region_visibility = 'private';
			const other = await signedIn('oren@example.com');
			expect((await profile(other)).data).toMatchObject({ city: null, region: null });
			mockStore.logout();
			const owner = await signedIn();
			expect((await profile(owner)).data).toMatchObject({
				city: tamsinFixture.city,
				region: tamsinFixture.region
			});
		});

		it('gives null for an empty city or region', async () => {
			const player = mockStore.playerByCode(tamsin);
			if (player) Object.assign(player, { city: '', region: '' });
			const api = await signedIn('oren@example.com');
			expect((await profile(api)).data).toMatchObject({ city: null, region: null });
		});

		it('is a 404 for an inactive account, an unknown code and a malformed one', async () => {
			const api = await signedIn('oren@example.com');
			for (const path of [code('saul'), 'P-AAAA-AAAA', 'not-a-code']) {
				const result = await profile(api, path);
				expect(result.response.status, path).toBe(404);
				expect(result.error).toEqual({ code: 'not_found', message: 'Not found.', errors: [] });
			}
		});

		it('leaves player search to its own handler', async () => {
			const api = await signedIn('oren@example.com');
			const found = await api.open.GET('/api/v1/players/search', {
				params: { query: { q: 'Tamsin' } }
			});
			expect(found.response.status).toBe(200);
		});
	});
});

describe('get_player_ratings', () => {
	const ratingsOf = (api: Api, player: string) =>
		api.open.GET('/api/v1/players/{code}/ratings', { params: { path: { code: player } } });

	async function signedIn(email = VERIFIED_EMAIL) {
		const { api } = browser();
		await api.initCsrf();
		expect((await login(api, email)).response.status).toBe(200);
		return api;
	}

	it('needs sign-in', async () => {
		const { api } = browser();
		expect((await ratingsOf(api, tamsin)).response.status).toBe(401);
	});

	it('serves demonstration ratings by format, with reliability 0 to 100', async () => {
		const api = await signedIn('kit@example.com');
		const body = await unwrap(ratingsOf(api, tamsin.toLowerCase()));
		expect(body).toMatchObject({
			code: tamsin,
			profile_url: `https://openpb.org/players/${tamsin}`,
			demonstration: true,
			ratings: {
				mixed_doubles: { rating: 3.42, reliability: 65, provisional: true, demonstration: true },
				doubles_women: { rating: 3.31, reliability: 40, imported_reliability: 30 }
			}
		});
		expect(Object.keys(body.ratings)).toHaveLength(2);
		expect(await unwrap(ratingsOf(api, code('kit')))).toMatchObject({ ratings: {} });
	});

	it('gives the same 404 for an unknown or malformed code and an inactive account', async () => {
		const api = await signedIn();
		for (const player of [code('saul'), 'P-AAAA-AAAA', 'nonsense']) {
			expect((await ratingsOf(api, player)).response.status).toBe(404);
		}
	});

	it('hides private current ratings from everyone but the player', async () => {
		const bea = mockStore.playerByCode(code('bea'));
		if (bea) bea.privacy.rating_visibility = 'private';
		const other = await signedIn();
		expect((await ratingsOf(other, code('bea'))).response.status).toBe(404);
		mockStore.logout();
		const own = await signedIn('bea@example.com');
		expect((await ratingsOf(own, code('bea'))).response.status).toBe(200);
	});
});

describe('list_player_rating_history', () => {
	const historyOf = (api: Api, player: string, query: { limit?: number; offset?: number } = {}) =>
		api.open.GET('/api/v1/players/{code}/rating-history', {
			params: { path: { code: player }, query }
		});

	async function signedIn(email = VERIFIED_EMAIL) {
		const { api } = browser();
		await api.initCsrf();
		expect((await login(api, email)).response.status).toBe(200);
		return api;
	}

	it('needs sign-in', async () => {
		const { api } = browser();
		expect((await historyOf(api, tamsin)).response.status).toBe(401);
	});

	it('pages the changes newest first, each a demonstration with its reliability', async () => {
		const api = await signedIn();
		const first = await unwrap(historyOf(api, tamsin, { limit: 5 }));
		expect(first.count).toBe(8);
		expect(first.items).toHaveLength(5);
		expect(first.items[0]).toMatchObject({
			rating_format: 'mixed_doubles',
			kind: 'live_update',
			rating: 3.42,
			reliability: 65,
			demonstration: true
		});
		expect(first.items.map((item) => item.kind)).toContain('removed');
		const times = first.items.map((item) => item.recorded_at);
		expect([...times].sort().reverse()).toEqual(times);
		const second = await unwrap(historyOf(api, tamsin, { limit: 5, offset: 5 }));
		expect(second).toMatchObject({ count: 8 });
		expect(second.items).toHaveLength(3);
		expect(await unwrap(historyOf(api, code('kit')))).toEqual({ items: [], count: 0 });
	});

	it('refuses a limit out of range', async () => {
		const api = await signedIn();
		expect((await historyOf(api, tamsin, { limit: 101 })).response.status).toBe(422);
	});

	it('gives the same 404 for an unknown or malformed code and an inactive account', async () => {
		const api = await signedIn();
		for (const player of [code('saul'), 'P-AAAA-AAAA', 'nonsense']) {
			expect((await historyOf(api, player)).response.status).toBe(404);
		}
	});

	it('hides private rating history from everyone but the player', async () => {
		const bea = mockStore.playerByCode(code('bea'));
		if (bea) bea.privacy.rating_history_visibility = 'private';
		const other = await signedIn();
		expect((await historyOf(other, code('bea'))).response.status).toBe(404);
		mockStore.logout();
		const own = await signedIn('bea@example.com');
		expect((await historyOf(own, code('bea'))).response.status).toBe(200);
	});
});

describe('a submission counts as the submitter confirming (backend #197)', () => {
	const awaiting = async (api: Api) =>
		(await unwrap(api.open.GET('/api/v1/me/matches/awaiting-confirmation'))).items.map(
			(m) => m.code
		);

	it("leaves the match off the submitter's awaiting list and on the opponent's", async () => {
		const mine = browser();
		await login(mine.api);
		const created = await unwrap(mine.api.open.POST('/api/v1/matches/', { body: newMatch }));
		expect(created).toMatchObject({
			status: 'pending',
			my_decision: 'confirm',
			confirmed_by_team: { a: true, b: false }
		});
		expect(await awaiting(mine.api)).not.toContain(created.code);

		mockStore.logout();
		const theirs = browser();
		await login(theirs.api, 'kit@example.com');
		expect(await awaiting(theirs.api)).toContain(created.code);
		const confirmed = await unwrap(
			theirs.api.open.POST('/api/v1/matches/{code}/confirm', {
				params: { path: { code: created.code } }
			})
		);
		expect(confirmed.status).toBe('confirmed');
	});

	it('names the earlier match in the 409 item as existing_code', async () => {
		const { api } = browser();
		await login(api);
		const first = await unwrap(api.open.POST('/api/v1/matches/', { body: newMatch }));
		const again = await api.open.POST('/api/v1/matches/', { body: newMatch });
		expect(again.response.status).toBe(409);
		expect(again.error?.errors).toEqual([
			{
				field: 'match',
				code: 'duplicate_match',
				message: `This match was already submitted as ${first.code}.`,
				existing_code: first.code
			}
		]);
	});
});

describe('signup details held for the create (backend#124)', () => {
	const PASSWORD = 'a-fine-password-9';
	const HELD = {
		birthYear: 1990,
		birthMonth: 6,
		genderDivision: 'womens',
		firstName: 'Fern',
		lastName: 'Mock',
		city: '',
		region: ''
	};
	const SIGNED_IN = {
		city_region_visibility: 'signed_in',
		match_history_visibility: 'signed_in',
		rating_history_visibility: 'signed_in',
		stats_visibility: 'signed_in',
		home_club_visibility: 'signed_in',
		rating_visibility: 'signed_in'
	};
	const PRIVATE = Object.fromEntries(Object.keys(SIGNED_IN).map((key) => [key, 'private']));

	async function signup(api: Api, email: string, extra: Record<string, unknown> = {}) {
		const result = await api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: { ...BORN, email, password: PASSWORD, ...extra } as never
		});
		expect(result.response.status).toBe(401);
	}

	/** Sign up, verify from the mailed link, then sign in. */
	async function signupAndSignIn(email: string, extra: Record<string, unknown> = {}) {
		const { api } = browser();
		await api.initCsrf();
		await signup(api, email, extra);
		const key = mockStore.state.outbox.findLast((m) => m.to === email)?.key as string;
		await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key }
		});
		expect((await login(api, email, PASSWORD)).response.status).toBe(200);
		return api;
	}

	it('creates an adult from the hold: the legal name as display name, city and region', async () => {
		const api = await signupAndSignIn('held.adult@example.com', {
			city: ' Vexmoor ',
			region: 'Norvane'
		});
		const made = await api.open.POST('/api/v1/me/player', { body: {} });
		expect(made.response.status).toBe(201);
		expect(made.data).toMatchObject({
			display_name: 'Sam Rivera',
			legal_name: 'Sam Rivera',
			birth_year: 1990,
			birth_month: 6,
			gender_division: 'mens',
			city: 'Vexmoor',
			region: 'Norvane',
			privacy: SIGNED_IN
		});
		expect(mockStore.state.signupHold ?? null).toBeNull();
	});

	it('starts a player aged 13 to 17 as "First L." with every setting private', async () => {
		const api = await signupAndSignIn('held.teen@example.com', {
			birth_year: new Date().getUTCFullYear() - 15,
			birth_month: 1,
			last_name: '́élan'
		});
		const made = await unwrap(api.open.POST('/api/v1/me/player', { body: {} }));
		expect(made.display_name).toBe('Sam é.');
		expect(made.legal_name).toBe('Sam ́élan');
		expect(made.privacy).toEqual(PRIVATE);
	});

	it('keeps the combining marks after the first character of the last name', async () => {
		const api = await signupAndSignIn('held.marks@example.com', {
			birth_year: new Date().getUTCFullYear() - 15,
			birth_month: 1,
			last_name: 'élan'
		});
		const made = await unwrap(api.open.POST('/api/v1/me/player', { body: {} }));
		expect(made.display_name).toBe('Sam é.');
	});

	it('ignores a body sent while details are held', async () => {
		const api = await signupAndSignIn('held.body@example.com');
		const made = await unwrap(
			api.open.POST('/api/v1/me/player', {
				body: {
					display_name: 'Other Name',
					birth_year: 1980,
					birth_month: 2,
					gender_division: 'womens'
				}
			})
		);
		expect(made).toMatchObject({
			display_name: 'Sam Rivera',
			birth_year: 1990,
			gender_division: 'mens'
		});
	});

	it('binds the hold to no account for a taken address, so the create needs the details', async () => {
		const { api } = browser();
		await api.initCsrf();
		await signup(api, UNVERIFIED_EMAIL);
		expect(mockStore.state.signupHold).toMatchObject({ email: null, firstName: 'Sam' });

		await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key: MOCK_KEYS.verifyEmail }
		});
		expect((await login(api, UNVERIFIED_EMAIL)).response.status).toBe(200);
		const result = await api.open.POST('/api/v1/me/player', { body: {} });
		expect(result.response.status).toBe(422);
		expect(result.error?.errors.map((e) => e.code)).toEqual([
			'missing',
			'missing',
			'missing',
			'missing'
		]);
	});

	it('keeps the hold of a repeated signup for the same address', async () => {
		const { api } = browser();
		await api.initCsrf();
		const email = 'held.again@example.com';
		await signup(api, email);
		await signup(api, email, { first_name: 'Other', birth_year: 1970 });
		expect(mockStore.state.signupHold).toMatchObject({
			email,
			firstName: 'Sam',
			birthYear: 1990
		});
	});

	it('drops the hold on logout, but keeps the refusal', async () => {
		mockStore.holdSignup(VERIFIED_EMAIL, HELD);
		mockStore.state.signupRefused = true;
		const { api } = browser();
		await login(api);
		await api.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams });
		expect(mockStore.state.signupHold ?? null).toBeNull();
		expect(mockStore.state.signupRefused).toBe(true);
	});

	it('drops the hold on a 409', async () => {
		mockStore.holdSignup(VERIFIED_EMAIL, HELD);
		const { api } = browser();
		await api.initCsrf();
		await login(api);
		const result = await api.open.POST('/api/v1/me/player', { body: {} });
		expect(result.response.status).toBe(409);
		expect(mockStore.state.signupHold ?? null).toBeNull();
	});

	it('keeps the hold after a 422, so the create can be tried again', async () => {
		const email = 'held.long@example.com';
		mockStore.state.accounts.push({ email, password: PASSWORD, verified: true, active: true });
		mockStore.holdSignup(email, { ...HELD, firstName: 'F'.repeat(70) });
		const { api } = browser();
		await api.initCsrf();
		await login(api, email, PASSWORD);
		const result = await api.open.POST('/api/v1/me/player', { body: {} });
		expect(result.response.status).toBe(422);
		expect(result.error?.errors.map((e) => [e.field, e.code])).toEqual([
			['body.display_name', 'max_length']
		]);
		expect(mockStore.state.signupHold?.email).toBe(email);
	});

	it('drops the hold when the create refuses the age', async () => {
		const email = 'held.child@example.com';
		mockStore.state.accounts.push({ email, password: PASSWORD, verified: true, active: true });
		mockStore.holdSignup('someone.else@example.com', HELD);
		const { api } = browser();
		await api.initCsrf();
		await login(api, email, PASSWORD);
		const result = await api.open.POST('/api/v1/me/player', {
			body: {
				display_name: 'Kid',
				birth_year: new Date().getFullYear() - 5,
				birth_month: 6,
				gender_division: 'mens'
			}
		});
		expect(result.response.status).toBe(422);
		expect(mockStore.state.signupRefused).toBe(true);
		expect(mockStore.state.signupHold ?? null).toBeNull();
	});

	it('answers 403 for an account whose email is not verified, and keeps the hold', async () => {
		mockStore.holdSignup(UNVERIFIED_EMAIL, HELD);
		mockStore.state.session = { email: UNVERIFIED_EMAIL, at: 0 };
		const { api } = browser();
		await api.initCsrf();
		const result = await api.open.POST('/api/v1/me/player', { body: {} });
		expect(result.response.status).toBe(403);
		expect(result.error).toEqual({
			code: 'forbidden',
			message: 'Verify your email address before creating your player.',
			errors: []
		});
		expect(mockStore.state.signupHold?.email).toBe(UNVERIFIED_EMAIL);
	});
});

describe('correct_match (backend#267)', () => {
	const fixture = (random: string) => buildCode('match', random);
	// Tamsin and Rosa, singles, pending and waiting on Tamsin.
	const PENDING = fixture('3FTB8ZRMK6P');
	// Tamsin and Kit against Bea and the private player Saul, disputed.
	const DISPUTED = fixture('R5GK9WBD2XF');
	// Tamsin and Nell against Idris and Saul, confirmed.
	const CONFIRMED = fixture('D9PW5KXE7RM');
	const singles = {
		format: 'singles' as const,
		played_on: '2026-11-12',
		team_a: [tamsin],
		team_b: [code('rosa')],
		games: [
			{ team_a: 11, team_b: 8 },
			{ team_a: 11, team_b: 6 }
		]
	};
	const at = (matchCode: string) => ({ params: { path: { code: matchCode } } });

	async function signedIn() {
		const { api } = browser();
		await login(api);
		return api;
	}

	it('voids a pending match and returns a pending correction with her confirmation', async () => {
		const api = await signedIn();
		const corrected = await unwrap(
			api.open.POST('/api/v1/matches/{code}/correction', { ...at(PENDING), body: singles })
		);
		expect(corrected.code).not.toBe(PENDING);
		expect(corrected).toMatchObject({
			status: 'pending',
			my_decision: 'confirm',
			confirmed_by_team: { a: true, b: false },
			game_target: 11,
			scoring_type: 'side_out'
		});
		expect(corrected.games).toEqual([
			{ number: 1, team_a: 11, team_b: 8 },
			{ number: 2, team_a: 11, team_b: 6 }
		]);
		const old = await unwrap(api.open.GET('/api/v1/matches/{code}', at(PENDING)));
		expect(old.status).toBe('voided');
		expect(mockStore.matchByCode(corrected.code)?.corrects).toBe(PENDING);
	});

	it('takes the teams in either order', async () => {
		const api = await signedIn();
		const swapped = {
			...singles,
			team_a: [code('rosa')],
			team_b: [tamsin],
			games: [{ team_a: 6, team_b: 11 }]
		};
		const result = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(PENDING),
			body: swapped
		});
		expect(result.response.status).toBe(200);
	});

	it('corrects a disputed match, and the correction is pending', async () => {
		const api = await signedIn();
		const body = {
			format: 'doubles' as const,
			played_on: '2026-11-03',
			team_a: [tamsin, code('kit')],
			team_b: [code('bea'), code('saul')],
			games: [
				{ team_a: 11, team_b: 9 },
				{ team_a: 11, team_b: 6 }
			]
		};
		const corrected = await unwrap(
			api.open.POST('/api/v1/matches/{code}/correction', { ...at(DISPUTED), body })
		);
		expect(corrected.status).toBe('pending');
		expect(mockStore.matchByCode(DISPUTED)?.status).toBe('voided');
	});

	it('refuses a confirmed match with 409, so she disputes it first', async () => {
		const api = await signedIn();
		const body = {
			format: 'doubles' as const,
			played_on: '2026-11-08',
			team_a: [tamsin, code('nell')],
			team_b: [code('idris'), code('saul')],
			games: [{ team_a: 15, team_b: 13 }]
		};
		const result = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(CONFIRMED),
			body
		});
		expect(result.response.status).toBe(409);
		expect(result.error).toMatchObject({ code: 'conflict', errors: [] });
		expect(mockStore.matchByCode(CONFIRMED)?.status).toBe('confirmed');
	});

	it('answers 404 for a match with an event, as for an unknown code', async () => {
		const match = mockStore.matchByCode(PENDING)!;
		match.event = true;
		const api = await signedIn();
		const result = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(PENDING),
			body: singles
		});
		expect(result.response.status).toBe(404);
		expect(result.error).toMatchObject({ code: 'not_found' });
		expect(match.status).toBe('pending');
	});

	it('answers 404 for other teams and for a match she did not play in', async () => {
		const api = await signedIn();
		const other = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(PENDING),
			body: { ...singles, team_b: [code('kit')] }
		});
		expect(other.response.status).toBe(404);
		const notHers = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(fixture('C4VD8RME2TX')),
			body: singles
		});
		expect(notHers.response.status).toBe(404);
	});

	it('answers 422 with the field for a score the rules refuse, and voids nothing', async () => {
		const api = await signedIn();
		const result = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(PENDING),
			body: { ...singles, games: [{ team_a: 11, team_b: 11 }] }
		});
		expect(result.response.status).toBe(422);
		expect(result.error?.errors[0]?.field).toMatch(/^body\.games\.0/);
		expect(mockStore.matchByCode(PENDING)?.status).toBe('pending');
	});

	it('refuses a second correction of the same match with 409', async () => {
		const api = await signedIn();
		await unwrap(
			api.open.POST('/api/v1/matches/{code}/correction', { ...at(PENDING), body: singles })
		);
		const again = await api.open.POST('/api/v1/matches/{code}/correction', {
			...at(PENDING),
			body: singles
		});
		expect(again.response.status).toBe(409);
	});
});
