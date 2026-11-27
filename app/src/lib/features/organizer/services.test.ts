import { beforeEach, describe, expect, it } from 'vitest';
import { allauthParams, createApi, isAppError, type Api } from '#lib/api/index.js';
import {
	GRANTED_CLUB,
	LARKSPUR,
	MANAGER_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL
} from '#lib/mocks/fixtures.js';
import { useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { session } from '#lib/features/auth/index.js';
import {
	createOrganizerEvent,
	deleteOrganizerEvent,
	listClubGrants,
	listOrganizerEvents,
	updateOrganizerEvent
} from './services.js';

useMockApi();

const BASE = 'http://localhost';

/** The real client with a cookie jar, recording each call. */
function browserApi() {
	const jar = new Map<string, string>();
	const calls: string[] = [];
	const fetchWithJar: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		calls.push(`${request.method} ${url.pathname}${url.search}`);
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
let calls: string[];

async function signIn(email: string) {
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
	session.apply({ status: 'signed_in', email });
	calls.length = 0;
}

async function refusal(call: Promise<unknown>) {
	const error = await call.then(
		() => null,
		(e: unknown) => e
	);
	if (!isAppError(error)) throw new Error('expected an AppError');
	return error;
}

const body = {
	organizer: LARKSPUR,
	name: 'Made-up Spring Open',
	kind: 'tournament' as const,
	club: null,
	start_date: '2027-03-06',
	end_date: '2027-03-07'
};

beforeEach(() => {
	({ api, calls } = browserApi());
	session.reset();
});

describe('listOrganizerEvents', () => {
	it('reads one page with limit and offset, and maps it', async () => {
		await signIn(ORGANIZER_EMAIL);
		const page = await listOrganizerEvents(1, { limit: 2, api });
		expect(calls).toEqual(['GET /api/v1/organizer/events?limit=2&offset=1']);
		expect(page.count).toBe(3);
		expect(page.items).toHaveLength(2);
		expect(page.items[0]).toHaveProperty('startDate');
	});

	it('reads 20 at a time by default', async () => {
		await signIn(ORGANIZER_EMAIL);
		await listOrganizerEvents(0, { api });
		expect(calls).toEqual(['GET /api/v1/organizer/events?limit=20&offset=0']);
	});
});

describe('createOrganizerEvent', () => {
	it('creates the Event and maps it', async () => {
		await signIn(MANAGER_EMAIL);
		const event = await createOrganizerEvent(body, { api });
		expect(event).toMatchObject({ name: 'Made-up Spring Open', organizer: LARKSPUR, club: null });
	});

	it('throws the 403 and reads the memberships again', async () => {
		await signIn(ORGANIZER_EMAIL);
		const error = await refusal(createOrganizerEvent(body, { api }));
		expect(error.status).toBe(403);
		expect(calls).toContain('GET /api/v1/organizer/organizers');
	});

	it('puts a 422 on the club field', async () => {
		await signIn(MANAGER_EMAIL);
		const error = await refusal(createOrganizerEvent({ ...body, club: 'C-NOPE-NOPE' }, { api }));
		expect(error.status).toBe(422);
		expect(error.fields).toEqual({ club: ['Choose an existing club.'] });
	});
});

describe('updateOrganizerEvent', () => {
	it('sends only the changes and maps the result', async () => {
		await signIn(MANAGER_EMAIL);
		const event = await updateOrganizerEvent('E-SEED-0001', { kind: 'tournament' }, { api });
		expect(event.kind).toBe('tournament');
	});

	it('throws the 409 for a new name on an Event with matches', async () => {
		await signIn(MANAGER_EMAIL);
		const error = await refusal(updateOrganizerEvent('E-SEED-0001', { name: 'New' }, { api }));
		expect(error.status).toBe(409);
		expect(calls).not.toContain('GET /api/v1/organizer/organizers');
	});

	it('throws the 404 and reads the memberships again', async () => {
		await signIn(ORGANIZER_EMAIL);
		const error = await refusal(updateOrganizerEvent('E-SEED-0002', { kind: 'league' }, { api }));
		expect(error.status).toBe(404);
		expect(calls).toContain('GET /api/v1/organizer/organizers');
	});
});

describe('deleteOrganizerEvent', () => {
	it('deletes an Event nothing names', async () => {
		await signIn(MANAGER_EMAIL);
		await deleteOrganizerEvent('E-SEED-0002', { api });
		expect(mockStore.state.events.map((e) => e.code)).not.toContain('E-SEED-0002');
	});

	it('throws the 409 for an Event with matches', async () => {
		await signIn(MANAGER_EMAIL);
		expect((await refusal(deleteOrganizerEvent('E-SEED-0001', { api }))).status).toBe(409);
	});

	it('throws the 404 and reads the memberships again', async () => {
		await signIn(ORGANIZER_EMAIL);
		expect((await refusal(deleteOrganizerEvent('E-SEED-0002', { api }))).status).toBe(404);
		expect(calls).toContain('GET /api/v1/organizer/organizers');
	});
});

describe('listClubGrants', () => {
	it("lists an admin's granted clubs", async () => {
		mockStore.turnOnTwoFactor(ORGANIZER_EMAIL);
		await signIn(ORGANIZER_EMAIL);
		const grants = await listClubGrants(LARKSPUR, { api });
		expect(grants).toEqual([
			{ club: GRANTED_CLUB, name: 'Juniper Court Club', city: 'Brindlequay', region: 'North Fen' }
		]);
	});

	it('throws the 404 for a match manager', async () => {
		await signIn(MANAGER_EMAIL);
		expect((await refusal(listClubGrants(LARKSPUR, { api }))).status).toBe(404);
	});
});
