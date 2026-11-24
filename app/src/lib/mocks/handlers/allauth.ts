import {
	SIGNUP_FIRST_NAME_MAX_LENGTH,
	SIGNUP_NAME_MAX_LENGTH,
	canonicalEmailSchema
} from '../../domain/schemas';
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
import {
	CONTROL_CHARACTER,
	NOT_TEXT,
	codePoints,
	hasControlCharacter,
	hasVisibleCharacter,
	isOldEnough,
	strip
} from '../player-rules';
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

const PLACE_MAX_LENGTH = 100;

/** A required name: stripped, then required, control characters, and its own length. */
function nameCheck(
	value: unknown,
	param: 'first_name' | 'last_name',
	requiredMessage: string
): { issue: AllauthIssue | null; value: string } {
	if (value === undefined || value === null) {
		return { issue: { code: 'required', message: requiredMessage, param }, value: '' };
	}
	if (typeof value !== 'string') {
		return { issue: { code: 'invalid', message: NOT_TEXT, param }, value: '' };
	}
	const stripped = strip(value);
	// The control-character check comes first, as in the backend.
	if (hasControlCharacter(stripped)) {
		return { issue: { code: 'invalid', message: CONTROL_CHARACTER, param }, value: stripped };
	}
	if (!hasVisibleCharacter(stripped)) {
		return { issue: { code: 'required', message: requiredMessage, param }, value: '' };
	}
	return { issue: null, value: stripped };
}

/** Optional place text: stripped, no control characters, at most 100 characters. */
function placeIssue(value: unknown, param: 'city' | 'region'): AllauthIssue | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return { code: 'invalid', message: NOT_TEXT, param };
	const stripped = strip(value);
	if (hasControlCharacter(stripped)) return { code: 'invalid', message: CONTROL_CHARACTER, param };
	if (codePoints(stripped) > PLACE_MAX_LENGTH) {
		return { code: 'max_length', message: `Enter at most ${PLACE_MAX_LENGTH} characters.`, param };
	}
	return null;
}

/** The names, with the first-name limit and then the limit on the two together. */
function nameIssues(body: Record<string, unknown>): AllauthIssue[] {
	const issues: AllauthIssue[] = [];
	const first = nameCheck(body.first_name, 'first_name', 'Enter your first name.');
	const last = nameCheck(body.last_name, 'last_name', 'Enter your last name.');
	const firstTooLong = !first.issue && codePoints(first.value) > SIGNUP_FIRST_NAME_MAX_LENGTH;
	if (first.issue) issues.push(first.issue);
	else if (firstTooLong) {
		issues.push({
			code: 'max_length',
			message: `Your first name can be at most ${SIGNUP_FIRST_NAME_MAX_LENGTH} characters.`,
			param: 'first_name'
		});
	}
	if (last.issue) issues.push(last.issue);
	else if (
		!first.issue &&
		!firstTooLong &&
		codePoints(`${first.value} ${last.value}`) > SIGNUP_NAME_MAX_LENGTH
	) {
		issues.push({
			code: 'max_length',
			message: `Your first and last name together can be at most ${SIGNUP_NAME_MAX_LENGTH - 1} characters.`,
			param: 'last_name'
		});
	}
	return issues;
}

/** The birth year and month checks, with the backend's messages, in its field order. */
function birthIssues(body: Record<string, unknown>): AllauthIssue[] {
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
	return issues;
}

/**
 * The backend's `SignupAgeForm` fields, with its messages, in its field order: birth year and
 * month, gender division, names, optional city and region, then the two agreements. The
 * values are never echoed back.
 */
function signupAgeIssues(body: Record<string, unknown>): AllauthIssue[] {
	const issues = birthIssues(body);
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
	issues.push(...nameIssues(body));
	for (const issue of [placeIssue(body.city, 'city'), placeIssue(body.region, 'region')]) {
		if (issue) issues.push(issue);
	}
	if (body.accepted_terms !== true) {
		issues.push({
			code: 'required',
			message: 'Accept the Terms of Service.',
			param: 'accepted_terms'
		});
	}
	if (body.accepted_privacy !== true) {
		issues.push({
			code: 'required',
			message: 'Accept the Privacy Policy.',
			param: 'accepted_privacy'
		});
	}
	return issues;
}

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

/**
 * allauth headless at `/_allauth/browser/v1`, with this backend's settings: email and
 * password. Sign-up also takes the birth month and year, the gender division, the names, an
 * optional city and region, and the two agreements. The age check takes the birth month and
 * year. Only the refusal flag is kept from any of them. Verification is mandatory and by link
 * (not by code), with no login on verification or on password reset. Because verification is
 * by link, `resend` is always a 409, as in allauth's `ResendEmailVerificationCodeView`.
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

		http.post(
			'/_allauth/{client}/v1/auth/signup/age-check',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				if (store.currentAccount()) return response.untyped(allauthStatus(store, 409));
				if (store.state.signupRefused) {
					return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
				}
				// Only the birth year and month are read. Nothing is stored but the refusal flag.
				const body = readObject(await readJson(request));
				const issues = birthIssues(body);
				if (issues.length > 0) return response.untyped(allauthErrors(store, issues));
				if (!isOldEnough(Number(body.birth_year), Number(body.birth_month))) {
					store.state.signupRefused = true;
					return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
				}
				return response.untyped(allauthStatus(store, 200));
			}
		),

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
