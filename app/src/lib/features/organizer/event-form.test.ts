import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, allauthParams, createApi, type Api } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session, type OrganizerMembership } from '#lib/features/auth/index.js';
import {
	GRANTED_CLUB,
	LARKSPUR,
	MANAGER_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL,
	THISTLE_BAY
} from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import {
	CREATE_FORBIDDEN,
	DELETE_PROTECTED,
	EDIT_LOCKED,
	EVENT_GONE,
	NOT_SAVED,
	eventErrorCopy
} from './copy.js';
import { EventForm } from './event-form.svelte.js';

useMockApi();

const BASE = 'http://localhost';

function membership(overrides: Partial<OrganizerMembership> = {}): OrganizerMembership {
	return {
		organizer: LARKSPUR,
		name: 'Larkspur Paddle League',
		role: 'match_manager',
		verified: true,
		verification_requested: false,
		...overrides
	};
}

const UNVERIFIED = membership({
	organizer: THISTLE_BAY,
	name: 'Thistle Bay Social',
	verified: false
});

const SEEDED_WITH_MATCHES: OrganizerEvent = {
	code: 'E-SEED-0001',
	name: 'Larkspur Winter League',
	kind: 'league',
	organizer: LARKSPUR,
	club: GRANTED_CLUB,
	startDate: '2026-11-02',
	endDate: '2026-12-14'
};

function browserApi() {
	const jar = new Map<string, string>();
	const sent: { call: string; body: unknown }[] = [];
	const fetchWithJar: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const text = await request.clone().text();
		const url = new URL(request.url);
		if (url.pathname.startsWith('/api/v1/organizer/events')) {
			sent.push({
				call: `${request.method} ${url.pathname}`,
				body: text ? JSON.parse(text) : undefined
			});
		}
		const response = await fetch(request);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return { api: createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies }), sent };
}

let api: Api;
let sent: { call: string; body: unknown }[];

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
}

function fill(form: EventForm) {
	form.name = 'Made-up Spring Open';
	form.kind = 'tournament';
	form.startDate = '2027-03-06';
	form.endDate = '2027-03-07';
}

beforeEach(() => {
	({ api, sent } = browserApi());
	session.reset();
});

describe('EventForm for a new Event', () => {
	it('offers only the verified organizers, and picks the only one', () => {
		const form = EventForm.create([membership(), UNVERIFIED]);
		expect(form.organizerChoices.map((m) => m.organizer)).toEqual([LARKSPUR]);
		expect(form.organizer).toBe(LARKSPUR);
	});

	it('picks no organizer when there are two to choose from', () => {
		const other = membership({ organizer: 'G-AAAA-BBBB', name: 'Made-up Second' });
		expect(EventForm.create([membership(), other]).organizer).toBe('');
	});

	it('checks the fields before sending, and sends nothing when they fail', async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.create([membership()]);
		form.startDate = '2027-03-07';
		form.endDate = '2027-03-06';
		expect(await form.submit({ api })).toEqual({ kind: 'invalid' });
		expect(form.errors).toMatchObject({
			name: "Enter the Event's name.",
			kind: 'Choose the kind of Event.',
			end_date: 'The end date cannot be before the start date.'
		});
		expect(sent).toEqual([]);
	});

	it('creates the Event with the trimmed name and no club', async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.create([membership()]);
		fill(form);
		form.name = '  Made-up Spring Open ';
		const outcome = await form.submit({ api });
		expect(outcome).toMatchObject({ kind: 'saved', event: { name: 'Made-up Spring Open' } });
		expect(sent[0].body).toEqual({
			organizer: LARKSPUR,
			name: 'Made-up Spring Open',
			kind: 'tournament',
			club: null,
			start_date: '2027-03-06',
			end_date: '2027-03-07'
		});
	});

	it("shows the backend's club message on the club field", async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.create([membership()]);
		fill(form);
		form.club = 'C-NOPE-NOPE';
		expect(await form.submit({ api })).toEqual({ kind: 'failed', gone: false });
		expect(form.errors.club).toBe('Choose an existing club.');
		expect(form.formError).toBeNull();
	});

	it('explains a 403 and links to two-factor setup when it is off', async () => {
		await signIn(ORGANIZER_EMAIL);
		session.mfaEnrolled = false;
		const form = EventForm.create([membership({ role: 'admin' })]);
		fill(form);
		await form.submit({ api });
		expect(form.formError).toEqual({ message: CREATE_FORBIDDEN, twoFactorLink: true });
	});

	it('leaves the two-factor link out when two-factor is on', () => {
		session.apply({ status: 'signed_in', email: MANAGER_EMAIL });
		session.mfaEnrolled = true;
		const error = new AppError({
			kind: 'forbidden',
			status: 403,
			code: 'mfa_required',
			message: 'x',
			fields: {}
		});
		expect(eventErrorCopy(error, 'create')).toEqual({
			message: CREATE_FORBIDDEN,
			twoFactorLink: false,
			fields: {}
		});
	});

	it('shows a 422 on a field the form does not have as a form error', async () => {
		server.use(
			http.post(`${BASE}/api/v1/organizer/events`, () =>
				HttpResponse.json(
					{
						code: 'validation_error',
						message: 'The request is not valid.',
						errors: [{ field: 'body', code: 'invalid', message: 'Made-up whole-form problem.' }]
					},
					{ status: 422 }
				)
			)
		);
		await signIn(MANAGER_EMAIL);
		const form = EventForm.create([membership()]);
		fill(form);
		await form.submit({ api });
		expect(form.formError?.message).toBe('Made-up whole-form problem.');
	});

	it('reads a 409 on create as not saved', async () => {
		server.use(
			http.post(`${BASE}/api/v1/organizer/events`, () =>
				HttpResponse.json(
					{ code: 'conflict', message: 'The event could not be saved. Try again.', errors: [] },
					{ status: 409 }
				)
			)
		);
		await signIn(MANAGER_EMAIL);
		const form = EventForm.create([membership()]);
		fill(form);
		await form.submit({ api });
		expect(form.formError?.message).toBe(NOT_SAVED);
	});
});

describe('EventForm for an existing Event', () => {
	it('fills the fields from the Event', () => {
		const form = EventForm.edit(SEEDED_WITH_MATCHES);
		expect([form.name, form.kind, form.organizer, form.club, form.startDate, form.endDate]).toEqual(
			['Larkspur Winter League', 'league', LARKSPUR, GRANTED_CLUB, '2026-11-02', '2026-12-14']
		);
	});

	it('sends nothing when nothing changed, not even a name with new spaces', async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.edit(SEEDED_WITH_MATCHES);
		form.name = ` ${SEEDED_WITH_MATCHES.name} `;
		expect(await form.submit({ api })).toEqual({ kind: 'unchanged' });
		expect(sent).toEqual([]);
	});

	it('sends only the kind when only the kind changed', async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.edit(SEEDED_WITH_MATCHES);
		form.kind = 'tournament';
		const outcome = await form.submit({ api });
		expect(outcome).toMatchObject({ kind: 'saved', event: { kind: 'tournament' } });
		expect(sent).toEqual([
			{ call: 'PATCH /api/v1/organizer/events/E-SEED-0001', body: { kind: 'tournament' } }
		]);
	});

	it('explains the 409 when a match locks the name', async () => {
		await signIn(MANAGER_EMAIL);
		const form = EventForm.edit(SEEDED_WITH_MATCHES);
		form.name = 'Made-up New Name';
		await form.submit({ api });
		expect(form.formError?.message).toBe(EDIT_LOCKED);
	});

	it('explains the 404 and says the Event is gone', async () => {
		await signIn(ORGANIZER_EMAIL);
		const form = EventForm.edit(SEEDED_WITH_MATCHES);
		form.kind = 'tournament';
		expect(await form.submit({ api })).toEqual({ kind: 'failed', gone: true });
		expect(form.formError?.message).toBe(EVENT_GONE);
	});
});

describe('eventErrorCopy for a delete', () => {
	const error = (status: number) =>
		new AppError({ kind: 'conflict', status, code: 'x', message: 'x', fields: {} });

	it('reads a 409 as matches or results files', () => {
		expect(eventErrorCopy(error(409), 'delete').message).toBe(DELETE_PROTECTED);
	});

	it('reads a 404 as gone', () => {
		expect(eventErrorCopy(error(404), 'delete').message).toBe(EVENT_GONE);
	});
});
