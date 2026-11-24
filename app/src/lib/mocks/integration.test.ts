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
			{ code: 'required', message: 'Choose a gender division.', param: 'gender_division' }
		]);
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

describe('provisional endpoints', () => {
	it('creates, reads and edits the own player; one per account', async () => {
		const { api } = browser();
		await api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: { ...BORN, email: 'fresh@example.com', password: 'a-fine-password-9' }
		});
		const key = mockStore.state.outbox.findLast((m) => m.kind === 'verify_email')?.key as string;
		await api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key }
		});
		await login(api, 'fresh@example.com', 'a-fine-password-9');

		const own = await fetchJson(api, 'GET', '/api/v1/me/player');
		expect(own.status).toBe(404);
		const made = await fetchJson(api, 'POST', '/api/v1/me/player', { display_name: 'Fern Mock' });
		expect(made.status).toBe(201);
		expect(made.body.display_name).toBe('Fern Mock');
		expect(made.body.code).toMatch(/^P-/);
		expect(
			(await fetchJson(api, 'POST', '/api/v1/me/player', { display_name: 'Again' })).status
		).toBe(409);
		const patched = await fetchJson(api, 'PATCH', '/api/v1/me/player', {
			privacy: { match_history_visibility: 'private' }
		});
		expect(patched.body.privacy?.match_history_visibility).toBe('private');
		expect((await fetchJson(api, 'POST', '/api/v1/me/player', {})).status).toBe(422);
	});

	it('shows the home club only to the owner or a signed-in viewer allowed by the setting', async () => {
		const profile = async () =>
			(await (await fetch(`${BASE}/api/v1/players/${tamsin}`)).json()) as {
				home_club: string | null;
			};
		// Signed out: never.
		expect((await profile()).home_club).toBeNull();

		// Another signed-in player: yes while the setting is signed_in.
		const { api } = browser();
		await login(api, 'oren@example.com');
		expect((await profile()).home_club).toBe('Riverside Pickleball Club');

		// The owner hides it: others lose it, the owner keeps it.
		const player = mockStore.playerByCode(tamsin);
		if (player) player.privacy.home_club_visibility = 'private';
		expect((await profile()).home_club).toBeNull();
		mockStore.logout();
		const owner = browser();
		await login(owner.api);
		expect((await profile()).home_club).toBe('Riverside Pickleball Club');
	});

	it('serves public profiles and ratings, and a 404 for hidden or unknown players', async () => {
		const { api } = browser();
		const profile = await fetch(`${BASE}/api/v1/players/${tamsin}`);
		expect(profile.status).toBe(200);
		const ratings = await fetch(`${BASE}/api/v1/players/${tamsin}/ratings`);
		expect(await ratings.json()).toMatchObject({
			demonstration: true,
			ratings: { doubles: { rating: 3.42, reliability: 0.65, provisional: true } }
		});
		expect((await fetch(`${BASE}/api/v1/players/${code('saul')}`)).status).toBe(404);
		expect((await fetch(`${BASE}/api/v1/players/P-AAAA-AAAA/ratings`)).status).toBe(404);
		void api;
	});
});

/** A raw call with the CSRF header, for the provisional endpoints (no generated client types). */
async function fetchJson(
	_api: Api,
	method: string,
	path: string,
	body?: unknown
): Promise<{ status: number; body: PlayerBody }> {
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', 'X-CSRFToken': mockStore.state.csrfToken },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	return { status: response.status, body: await response.json() };
}

type PlayerBody = {
	code?: string;
	display_name?: string;
	privacy?: { match_history_visibility?: string };
};
