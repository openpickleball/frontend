import { canonicalEmailSchema } from '../../domain/schemas';
import { allauthHttp as http, csrfValid, readJson, readObject } from '../http';
import {
	allauthCsrfFailed,
	allauthErrors,
	allauthJson,
	allauthStatus,
	authenticated,
	invalidEmail,
	required,
	unauthenticated,
	userOut,
	type AllauthIssue
} from '../responses';
import { passwordErrors, type MockStore } from '../store';

const MISMATCH: AllauthIssue = {
	code: 'email_password_mismatch',
	message: 'The email address and/or password you specified are not correct.',
	param: 'password'
};

const INVALID_VERIFY_KEY: AllauthIssue = {
	code: 'invalid_or_expired_key',
	message: 'Invalid or expired key.',
	param: 'key'
};

const INVALID_RESET_KEY: AllauthIssue = {
	code: 'invalid_password_reset',
	message: 'The password reset token was invalid.',
	param: 'key'
};

const SIGNUP_REFUSED: AllauthIssue = {
	code: 'signup_refused',
	message: "We can't create an account with these details."
};

const WHOLE_NUMBER = 'Enter a whole number.';
const MONTH_RANGE = 'Enter a month from 1 to 12.';

/** Django's `IntegerField`: an int, or a string of one. `null` when it was left out. */
function wholeNumber(value: unknown): number | 'invalid' | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value === 'number') return Number.isInteger(value) ? value : 'invalid';
	if (typeof value === 'string' && /^\s*[-+]?\d+\s*$/.test(value)) return Number(value);
	return 'invalid';
}

/**
 * The backend's `SignupAgeForm`: birth year, birth month and gender division, with its
 * messages, in its field order. The value is never echoed back.
 */
function signupAgeIssues(body: Record<string, unknown>): AllauthIssue[] {
	const issues: AllauthIssue[] = [];
	const year = wholeNumber(body.birth_year);
	if (year === null) {
		issues.push({ code: 'required', message: 'Enter your birth year.', param: 'birth_year' });
	} else if (year === 'invalid') {
		issues.push({ code: 'invalid', message: WHOLE_NUMBER, param: 'birth_year' });
	} else if (year < 1900) {
		issues.push({
			code: 'min_value',
			message: 'Enter a birth year of 1900 or later.',
			param: 'birth_year'
		});
	}
	const month = wholeNumber(body.birth_month);
	if (month === null) {
		issues.push({ code: 'required', message: 'Enter your birth month.', param: 'birth_month' });
	} else if (month === 'invalid') {
		issues.push({ code: 'invalid', message: WHOLE_NUMBER, param: 'birth_month' });
	} else if (month < 1) {
		issues.push({ code: 'min_value', message: MONTH_RANGE, param: 'birth_month' });
	} else if (month > 12) {
		issues.push({ code: 'max_value', message: MONTH_RANGE, param: 'birth_month' });
	}
	const division = body.gender_division;
	if (division === undefined || division === null || division === '') {
		issues.push({
			code: 'required',
			message: 'Choose a gender division.',
			param: 'gender_division'
		});
	} else if (division !== 'mens' && division !== 'womens') {
		issues.push({
			code: 'invalid_choice',
			message: 'Choose one of the listed options.',
			param: 'gender_division'
		});
	}
	return issues;
}

/**
 * At least 13, as backend `apps/players/age.py` counts it: born on the last day of the birth
 * month, on today's date at UTC-12 (the earliest date on Earth).
 */
function isOldEnough(year: number, month: number, now = new Date()): boolean {
	const today = new Date(now.getTime() - 12 * 60 * 60 * 1000);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const [todayMonth, todayDay] = [today.getUTCMonth() + 1, today.getUTCDate()];
	let age = today.getUTCFullYear() - year;
	if (todayMonth < month || (todayMonth === month && todayDay < lastDay)) age -= 1;
	return age >= 13;
}

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

/**
 * allauth headless at `/_allauth/browser/v1`, with this backend's settings: email and
 * password, mandatory verification by link (not by code), no login on verification or
 * on password reset. Because verification is by link, `resend` is always a 409, as in
 * allauth's `ResendEmailVerificationCodeView`.
 */
export function createAllauthHandlers(store: MockStore) {
	return [
		http.get('/_allauth/{client}/v1/config', ({ response }) =>
			response.untyped(
				allauthJson(store, 200, {
					status: 200,
					data: {
						account: {
							login_methods: ['email'],
							is_open_for_signup: true,
							email_verification_by_code_enabled: false,
							login_by_code_enabled: false,
							password_reset_by_code_enabled: false,
							authentication_method: 'email'
						}
					}
				})
			)
		),

		http.get('/_allauth/{client}/v1/auth/session', ({ response }) => {
			const account = store.currentAccount();
			if (!account) return response.untyped(unauthenticated(store));
			return response.untyped(authenticated(store, account.email, store.state.session?.at ?? 0));
		}),

		http.delete('/_allauth/{client}/v1/auth/session', ({ request, cookies, response }) => {
			if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
			store.logout();
			return response.untyped(unauthenticated(store));
		}),

		http.post('/_allauth/{client}/v1/auth/login', async ({ request, cookies, response }) => {
			if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
			if (store.currentAccount()) return response.untyped(allauthStatus(store, 409));
			const body = readObject(await readJson(request));
			const email = text(body.email);
			const password = text(body.password);
			const issues: AllauthIssue[] = [];
			if (!email) issues.push(required('email'));
			else if (!canonicalEmailSchema.safeParse(email).success) issues.push(invalidEmail());
			if (!password) issues.push(required('password'));
			if (issues.length > 0 || !email || !password) {
				return response.untyped(allauthErrors(store, issues));
			}
			const result = store.login(email, password);
			if (result === 'mismatch') return response.untyped(allauthErrors(store, [MISMATCH]));
			if (result === 'unverified') return response.untyped(unauthenticated(store));
			const account = store.currentAccount();
			return response.untyped(
				authenticated(store, account?.email ?? email, store.state.session?.at ?? 0)
			);
		}),

		http.post('/_allauth/{client}/v1/auth/signup', async ({ request, cookies, response }) => {
			if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
			if (store.currentAccount()) return response.untyped(allauthStatus(store, 409));
			// The backend's age screen comes first. Once it refuses, every later sign-up in this
			// session gets the same answer, whatever is sent. Only that flag is kept, never the age.
			if (store.state.signupRefused) {
				return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
			}
			const body = readObject(await readJson(request));
			const ageIssues = signupAgeIssues(body);
			if (ageIssues.length > 0) return response.untyped(allauthErrors(store, ageIssues));
			if (!isOldEnough(Number(body.birth_year), Number(body.birth_month))) {
				store.state.signupRefused = true;
				return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
			}
			const email = text(body.email);
			const password = text(body.password);
			const issues: AllauthIssue[] = [];
			if (!email) issues.push(required('email'));
			else {
				for (const issue of store.emailIssues(email)) issues.push({ ...issue, param: 'email' });
			}
			if (!password) issues.push(required('password'));
			else {
				for (const issue of passwordErrors(password, email ?? '')) {
					issues.push({ ...issue, param: 'password' });
				}
			}
			if (issues.length > 0 || !email || !password) {
				return response.untyped(allauthErrors(store, issues));
			}
			store.signup(email, password);
			return response.untyped(unauthenticated(store));
		}),

		http.get('/_allauth/{client}/v1/auth/email/verify', ({ request, response }) => {
			const key = request.headers.get('X-Email-Verification-Key') ?? '';
			const token = store.tokenFor(key, 'verify_email');
			if (!token) return response.untyped(allauthErrors(store, [INVALID_VERIFY_KEY]));
			return response.untyped(
				allauthJson(store, 200, {
					status: 200,
					data: { email: token.email, user: userOut(token.email) },
					meta: { is_authenticating: store.state.pendingEmail === token.email }
				})
			);
		}),

		http.post('/_allauth/{client}/v1/auth/email/verify', async ({ request, cookies, response }) => {
			if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
			const key = text(readObject(await readJson(request)).key);
			if (!key) return response.untyped(allauthErrors(store, [required('key')]));
			if (!store.verifyEmail(key)) {
				return response.untyped(allauthErrors(store, [INVALID_VERIFY_KEY]));
			}
			// Verifying does not sign anyone in: the player logs in next.
			return response.untyped(unauthenticated(store));
		}),

		http.post(
			'/_allauth/{client}/v1/auth/email/verify/resend',
			({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				return response.untyped(allauthStatus(store, 409));
			}
		),

		http.post(
			'/_allauth/{client}/v1/auth/password/request',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const email = text(readObject(await readJson(request)).email);
				if (!email) return response.untyped(allauthErrors(store, [required('email')]));
				if (!canonicalEmailSchema.safeParse(email).success) {
					return response.untyped(allauthErrors(store, [invalidEmail()]));
				}
				// Same answer whether or not an account has the address.
				store.requestPasswordReset(email);
				return response.untyped(allauthStatus(store, 200));
			}
		),

		http.get('/_allauth/{client}/v1/auth/password/reset', ({ request, response }) => {
			const key = request.headers.get('X-Password-Reset-Key') ?? '';
			const token = store.tokenFor(key, 'reset_password');
			if (!token) return response.untyped(allauthErrors(store, [INVALID_RESET_KEY]));
			return response.untyped(
				allauthJson(store, 200, { status: 200, data: { user: userOut(token.email) } })
			);
		}),

		http.post(
			'/_allauth/{client}/v1/auth/password/reset',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const body = readObject(await readJson(request));
				const key = text(body.key);
				const password = text(body.password);
				const issues: AllauthIssue[] = [];
				if (!key) issues.push(required('key'));
				if (!password) issues.push(required('password'));
				if (!key || !password) return response.untyped(allauthErrors(store, issues));
				const token = store.tokenFor(key, 'reset_password');
				if (!token) return response.untyped(allauthErrors(store, [INVALID_RESET_KEY]));
				const problems = passwordErrors(password, token.email);
				if (problems.length > 0) {
					return response.untyped(
						allauthErrors(
							store,
							problems.map((p) => ({ ...p, param: 'password' }))
						)
					);
				}
				store.resetPassword(key, password);
				// No login on reset: the answer is the unauthenticated session.
				return response.untyped(unauthenticated(store));
			}
		)
	];
}
