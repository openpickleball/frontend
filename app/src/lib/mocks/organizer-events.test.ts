/**
 * The mock's Event rules, through the real client. They follow the backend's
 * `apps/events/api.py` and `apps/clubs/api.py` (`list_organizer_club_grants`): authority is a
 * verified organizer, membership and two-factor (403 on create, 404 on change and delete), a
 * match locks the name and dates, and only an admin with two-factor reads the club grants.
 */
import { describe, expect, it } from 'vitest';
import { allauthParams, createApi } from '../api';
import {
	GRANTED_CLUB,
	LARKSPUR,
	MANAGER_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL,
	THISTLE_BAY,
	TWO_FACTOR_EMAIL,
	UNGRANTED_CLUB,
	VERIFIED_EMAIL
} from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';
import { EVENTS_MAX_PAGE_SIZE, EVENTS_PAGE_SIZE } from './validation';

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

/** Signs in, passing the code step for an account with two-factor. */
async function signIn(email: string): Promise<Api> {
	const api = browser();
	const login = await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password: MOCK_PASSWORD }
	});
	if (login.response.status === 401) {
		await api.allauth.POST('/_allauth/{client}/v1/auth/2fa/authenticate', {
			params: allauthParams,
			body: { code: MOCK_TOTP_CODE }
		});
	}
	return api;
}

const newEvent = {
	organizer: LARKSPUR,
	name: 'Made-up Spring Open',
	kind: 'tournament' as const,
	start_date: '2027-03-06',
	end_date: '2027-03-07'
};

function create(api: Api, body: Record<string, unknown>) {
	return api.open.POST('/api/v1/organizer/events', { body: body as typeof newEvent });
}

function list(api: Api, query: { limit?: number; offset?: number } = {}) {
	return api.open.GET('/api/v1/organizer/events', { params: { query } });
}

function patch(api: Api, code: string, body: Record<string, unknown>) {
	return api.open.PATCH('/api/v1/organizer/events/{code}', {
		params: { path: { code } },
		body: body as { name?: string }
	});
}

function remove(api: Api, code: string) {
	return api.open.DELETE('/api/v1/organizer/events/{code}', { params: { path: { code } } });
}

function grants(api: Api, code: string) {
	return api.open.GET('/api/v1/organizer/organizers/{code}/club-grants', {
		params: { path: { code } }
	});
}

/** The seeded Event that a match names, and one that nothing names. */
function seeded() {
	const withMatches = mockStore.state.events.find((e) => e.hasMatches);
	const free = mockStore.state.events.find((e) => !e.hasMatches && !e.hasUploads);
	const withUploads = mockStore.state.events.find((e) => !e.hasMatches && e.hasUploads);
	if (!withMatches || !free || !withUploads) throw new Error('the fixtures changed');
	return { withMatches, free, withUploads };
}

describe('GET organizer/events', () => {
	it("lists the Events of the account's organizers, newest start date first", async () => {
		const api = await signIn(ORGANIZER_EMAIL);
		const page = await list(api);
		expect(page.data?.count).toBe(3);
		const starts = page.data?.items.map((e) => e.start_date) ?? [];
		expect(starts).toEqual([...starts].sort().reverse());
		expect(page.data?.items.every((e) => e.organizer === LARKSPUR)).toBe(true);
	});

	it('lists the same Events for a match manager of the organizer', async () => {
		const api = await signIn(MANAGER_EMAIL);
		expect((await list(api)).data?.count).toBe(3);
	});

	it('lists nothing for a player who is not a member', async () => {
		const api = await signIn(VERIFIED_EMAIL);
		expect((await list(api)).data).toEqual({ items: [], count: 0 });
	});

	it('pages by limit and offset', async () => {
		const api = await signIn(ORGANIZER_EMAIL);
		const all = (await list(api)).data?.items ?? [];
		const second = await list(api, { limit: 2, offset: 2 });
		expect(second.data?.count).toBe(3);
		expect(second.data?.items).toEqual(all.slice(2));
	});

	it(`pages ${EVENTS_PAGE_SIZE} by default and refuses more than ${EVENTS_MAX_PAGE_SIZE}`, async () => {
		const api = await signIn(MANAGER_EMAIL);
		for (let i = 0; i < 25; i++) {
			expect((await create(api, { ...newEvent, name: `Made-up Night ${i}` })).response.status).toBe(
				201
			);
		}
		expect((await list(api)).data?.items).toHaveLength(EVENTS_PAGE_SIZE);
		expect((await list(api, { limit: EVENTS_MAX_PAGE_SIZE + 1 })).response.status).toBe(422);
	});
});

describe('POST organizer/events', () => {
	it('creates an Event for a member with two-factor and lists it', async () => {
		const api = await signIn(MANAGER_EMAIL);
		const created = await create(api, { ...newEvent, name: '  Made-up Spring Open ' });
		expect(created.response.status).toBe(201);
		expect(created.data).toMatchObject({
			code: 'E-MOCK-0001',
			name: 'Made-up Spring Open',
			organizer: LARKSPUR,
			club: null
		});
		const codes = (await list(api)).data?.items.map((e) => e.code);
		expect(codes).toContain('E-MOCK-0001');
	});

	it('takes the organizer code in any case, with or without hyphens', async () => {
		const api = await signIn(MANAGER_EMAIL);
		const loose = LARKSPUR.toLowerCase().replaceAll('-', '');
		const created = await create(api, { ...newEvent, organizer: loose });
		expect(created.data?.organizer).toBe(LARKSPUR);
	});

	it.each([
		['a member without two-factor', ORGANIZER_EMAIL, LARKSPUR],
		['a member of an unverified organizer', MANAGER_EMAIL, THISTLE_BAY],
		['an account that is not a member', TWO_FACTOR_EMAIL, LARKSPUR],
		['an unknown organizer', MANAGER_EMAIL, 'G-ZZZZ-ZZZZ']
	])('refuses %s with one plain 403', async (_, email, organizer) => {
		const api = await signIn(email);
		const refused = await create(api, { ...newEvent, organizer, club: 'C-NOPE-NOPE' });
		expect(refused.response.status).toBe(403);
		expect(refused.error).toMatchObject({ code: 'forbidden' });
	});

	it('names a club that allowed the organizer', async () => {
		const api = await signIn(MANAGER_EMAIL);
		const created = await create(api, { ...newEvent, club: GRANTED_CLUB.toLowerCase() });
		expect(created.data?.club).toBe(GRANTED_CLUB);
	});

	it.each([
		['an unknown club', 'C-NOPE-NOPE', 'Choose an existing club.'],
		['a club with no grant', UNGRANTED_CLUB, 'This club has not allowed the organizer to name it.']
	])('refuses %s on the club field', async (_, club, message) => {
		const api = await signIn(MANAGER_EMAIL);
		const refused = await create(api, { ...newEvent, club });
		expect(refused.response.status).toBe(422);
		expect(refused.error?.errors).toEqual([
			expect.objectContaining({ field: 'body.club', message })
		]);
	});

	it('refuses an end date before the start date', async () => {
		const api = await signIn(MANAGER_EMAIL);
		const refused = await create(api, { ...newEvent, end_date: '2027-03-05' });
		expect(refused.response.status).toBe(422);
		expect(refused.error?.errors).toEqual([
			expect.objectContaining({
				field: 'body.end_date',
				message: 'The end date cannot be before the start date.'
			})
		]);
	});

	it('refuses a blank name and a missing date', async () => {
		const api = await signIn(MANAGER_EMAIL);
		const blank = await create(api, { ...newEvent, name: '   ' });
		expect(blank.response.status).toBe(422);
		expect(blank.error?.errors.map((e) => e.field)).toEqual(['body.name']);
		const missing = await create(api, { ...newEvent, start_date: undefined });
		expect(missing.response.status).toBe(422);
		expect(missing.error?.errors.map((e) => e.field)).toEqual(['body.start_date']);
	});
});

describe('PATCH organizer/events/{code}', () => {
	it('changes the kind of an Event a match names', async () => {
		const { withMatches } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		const changed = await patch(api, withMatches.code, { kind: 'rec_verified' });
		expect(changed.response.status).toBe(200);
		expect(changed.data?.kind).toBe('rec_verified');
	});

	it('refuses a new name or date on an Event a match names, but not the stored value', async () => {
		const { withMatches } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		const renamed = await patch(api, withMatches.code, { name: 'Made-up New Name' });
		expect(renamed.response.status).toBe(409);
		const moved = await patch(api, withMatches.code, { start_date: '2026-01-01' });
		expect(moved.response.status).toBe(409);
		const same = await patch(api, withMatches.code, { name: ` ${withMatches.name}` });
		expect(same.response.status).toBe(200);
	});

	it('changes the name and dates of an Event nothing names', async () => {
		const { free } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		const changed = await patch(api, free.code, {
			name: 'Made-up Renamed Classic',
			end_date: free.startDate
		});
		expect(changed.data).toMatchObject({
			name: 'Made-up Renamed Classic',
			end_date: free.startDate
		});
	});

	it('refuses an explicit null and an end date before the start date with 422', async () => {
		const { free } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		expect((await patch(api, free.code, { name: null })).response.status).toBe(422);
		const early = await patch(api, free.code, { end_date: '2000-01-01' });
		expect(early.response.status).toBe(422);
		expect(early.error?.errors.map((e) => e.field)).toEqual(['body.end_date']);
	});

	it.each([
		['a member without two-factor', ORGANIZER_EMAIL],
		['an account that is not a member', TWO_FACTOR_EMAIL]
	])('answers 404 to %s', async (_, email) => {
		const { free } = seeded();
		const api = await signIn(email);
		expect((await patch(api, free.code, { kind: 'league' })).response.status).toBe(404);
	});

	it('answers 404 for an unknown Event', async () => {
		const api = await signIn(MANAGER_EMAIL);
		expect((await patch(api, 'E-ZZZZ-ZZZZ', { kind: 'league' })).response.status).toBe(404);
	});
});

describe('DELETE organizer/events/{code}', () => {
	it('deletes an Event nothing names', async () => {
		const { free } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		expect((await remove(api, free.code)).response.status).toBe(204);
		const codes = (await list(api)).data?.items.map((e) => e.code);
		expect(codes).not.toContain(free.code);
	});

	it('refuses an Event a match or a results file names with 409', async () => {
		const { withMatches, withUploads } = seeded();
		const api = await signIn(MANAGER_EMAIL);
		expect((await remove(api, withMatches.code)).response.status).toBe(409);
		expect((await remove(api, withUploads.code)).response.status).toBe(409);
	});

	it('answers 404 to a member without two-factor', async () => {
		const { free } = seeded();
		const api = await signIn(ORGANIZER_EMAIL);
		expect((await remove(api, free.code)).response.status).toBe(404);
	});
});

describe('GET organizer/organizers/{code}/club-grants', () => {
	it('lists the granted clubs to an admin with two-factor', async () => {
		mockStore.turnOnTwoFactor(ORGANIZER_EMAIL);
		const api = await signIn(ORGANIZER_EMAIL);
		const result = await grants(api, LARKSPUR);
		expect(result.response.status).toBe(200);
		expect(result.data).toEqual([
			expect.objectContaining({ club: GRANTED_CLUB, name: expect.any(String) })
		]);
	});

	it('answers mfa_required to an admin without two-factor', async () => {
		const api = await signIn(ORGANIZER_EMAIL);
		const result = await grants(api, LARKSPUR);
		expect(result.response.status).toBe(403);
		expect(result.error).toMatchObject({ code: 'mfa_required' });
	});

	it.each([
		['a match manager', MANAGER_EMAIL, LARKSPUR],
		['an account that is not a member', TWO_FACTOR_EMAIL, LARKSPUR],
		['an unknown organizer', MANAGER_EMAIL, 'G-ZZZZ-ZZZZ']
	])('answers 404 to %s', async (_, email, code) => {
		const api = await signIn(email);
		expect((await grants(api, code)).response.status).toBe(404);
	});
});

describe('the store helpers for e2e', () => {
	it('removes a membership, after which the organizer is not listed', async () => {
		mockStore.removeMembership(MANAGER_EMAIL, LARKSPUR);
		const api = await signIn(MANAGER_EMAIL);
		const mine = await api.open.GET('/api/v1/organizer/organizers');
		expect(mine.data?.map((m) => m.organizer)).toEqual([THISTLE_BAY]);
		expect((await list(api)).data?.count).toBe(0);
	});
});
