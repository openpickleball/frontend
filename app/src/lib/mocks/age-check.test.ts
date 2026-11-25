/**
 * The signup age check against the mock handlers, as the backend answers it: birth year and
 * month only, one fixed refusal under 13, and a flag that outlives the request.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';

useMockApi();

const BASE = 'http://localhost/_allauth/browser/v1';
const REFUSED = {
	code: 'signup_refused',
	message: "We can't create an account with these details."
};

type Answer = { status: number; body: { status: number; errors?: unknown[] } };

async function post(path: string, body: Record<string, unknown>, csrf = true): Promise<Answer> {
	const response = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(csrf ? { 'X-CSRFToken': mockStore.state.csrfToken } : {})
		},
		body: JSON.stringify(body)
	});
	const text = await response.text();
	return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text };
}

const ageCheck = (body: Record<string, unknown>, csrf = true) =>
	post('/auth/signup/age-check', body, csrf);
const signup = (body: Record<string, unknown>) => post('/auth/signup', body);

const adult = { birth_year: 1990, birth_month: 6 };
const child = { birth_year: new Date().getFullYear() - 5, birth_month: 6 };
const fullBody = {
	...adult,
	gender_division: 'mens',
	first_name: 'Sam',
	last_name: 'Rivera',
	accepted_terms: true,
	accepted_privacy: true,
	email: 'new.player@example.com',
	password: 'a-fine-password-9'
};

describe('signup age check', () => {
	it('answers 200 for an adult and stores nothing', async () => {
		const result = await ageCheck(adult);
		expect(result).toEqual({ status: 200, body: { status: 200 } });
		expect(mockStore.state.signupRefused).toBeFalsy();
		expect(mockStore.state.outbox).toEqual([]);
	});

	it('gives field errors for a missing year and month, and sets no flag', async () => {
		const result = await ageCheck({});
		expect(result.status).toBe(400);
		expect(result.body.errors).toEqual([
			{ code: 'required', message: 'Enter your birth year.', param: 'birth_year' },
			{ code: 'required', message: 'Enter your birth month.', param: 'birth_month' }
		]);
		expect((await ageCheck(adult)).status).toBe(200);
	});

	it('does not check the gender division or anything else', async () => {
		expect((await ageCheck({ ...adult, gender_division: 'mixed' })).status).toBe(200);
	});

	it('refuses an under-13 age and flags the session', async () => {
		const result = await ageCheck(child);
		expect(result.status).toBe(400);
		expect(result.body.errors).toEqual([REFUSED]);
		expect(mockStore.state.signupRefused).toBe(true);
		expect((await ageCheck(adult)).body.errors).toEqual([REFUSED]);
		const later = await signup(fullBody);
		expect(later.status).toBe(400);
		expect(later.body.errors).toEqual([REFUSED]);
	});

	it('is flagged by a refused signup too', async () => {
		await signup({ ...fullBody, birth_year: child.birth_year });
		const result = await ageCheck(adult);
		expect(result.status).toBe(400);
		expect(result.body.errors).toEqual([REFUSED]);
	});

	it('answers 409 when signed in', async () => {
		mockStore.login(VERIFIED_EMAIL, MOCK_PASSWORD);
		expect((await ageCheck(adult)).status).toBe(409);
	});

	it('answers 403 without a CSRF token', async () => {
		expect((await ageCheck(adult, false)).status).toBe(403);
	});

	describe('with a fixed clock', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it.each([
			['the day before the last day', '2026-06-30T11:59:00Z', 400],
			['the last day, at UTC-12', '2026-06-30T12:00:00Z', 200]
		])('born June 2013, %s', async (_name, now, status) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(now));
			expect((await ageCheck({ birth_year: 2013, birth_month: 6 })).status).toBe(status);
		});
	});

	describe('drops the signup hold on a refusal', () => {
		const held = {
			birthYear: 1990,
			birthMonth: 6,
			genderDivision: 'mens',
			firstName: 'Sam',
			lastName: 'Rivera',
			city: '',
			region: ''
		};

		it('at the age check', async () => {
			mockStore.holdSignup('held@example.com', held);
			await ageCheck(child);
			expect(mockStore.state.signupHold ?? null).toBeNull();
		});

		it('at signup', async () => {
			mockStore.holdSignup('held@example.com', held);
			await signup({ ...fullBody, birth_year: child.birth_year });
			expect(mockStore.state.signupHold ?? null).toBeNull();
		});

		it('at signup, when the session was refused before', async () => {
			mockStore.state.signupRefused = true;
			mockStore.holdSignup('held@example.com', held);
			await signup(fullBody);
			expect(mockStore.state.signupHold ?? null).toBeNull();
		});
	});
});
