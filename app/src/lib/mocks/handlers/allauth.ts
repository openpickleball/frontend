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
	incorrectCode,
	incorrectPassword,
	invalidEmail,
	reauthenticationRequired,
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
import {
	MFA_TYPES,
	passwordErrors,
	type MfaGuard,
	type MockAccount,
	type MockStore,
	type SignupDetails
} from '../store';
import { MOCK_TOTP_SECRET } from '../fixtures';

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

/** The details the backend holds for the create, from a body that passed `signupAgeIssues`. */
function signupDetails(body: Record<string, unknown>): SignupDetails {
	const place = (value: unknown) => (typeof value === 'string' ? strip(value) : '');
	return {
		birthYear: Number(body.birth_year),
		birthMonth: Number(body.birth_month),
		genderDivision: String(body.gender_division),
		firstName: strip(String(body.first_name)),
		lastName: strip(String(body.last_name)),
		city: place(body.city),
		region: place(body.region)
	};
}

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

/** allauth's `TOTPAuthenticator` and `RecoveryCodesAuthenticator`, as listed. */
function totpOut(account: MockAccount) {
	return { type: 'totp' as const, created_at: account.totp?.createdAt ?? 0, last_used_at: null };
}

function recoveryCodesOut(account: MockAccount) {
	const codes = account.recoveryCodes;
	const unused = codes ? codes.codes.filter((code) => !codes.used.includes(code)) : [];
	return {
		type: 'recovery_codes' as const,
		created_at: codes?.createdAt ?? 0,
		last_used_at: null,
		total_code_count: codes?.codes.length ?? 0,
		unused_code_count: unused.length,
		unused
	};
}

/**
 * allauth headless at `/_allauth/browser/v1`, with this backend's settings: email and
 * password. Sign-up also takes the birth month and year, the gender division, the names, an
 * optional city and region, and the two agreements. The age check takes the birth month and
 * year. A sign-up holds its details for `POST me/player` (`store.signup`), and an age refusal
 * sets the session's refusal flag and drops any hold (`store.refuseSignup`). Verification is mandatory and by link
 * (not by code), with no login on verification or on password reset. Because verification is
 * by link, `resend` is always a 409, as in allauth's `ResendEmailVerificationCodeView`.
 */
export function createAllauthHandlers(store: MockStore) {
	/** The answer to a management call the session may not make yet. */
	function refused(guard: Exclude<MfaGuard, { ok: true }>): Response {
		if (guard.kind === 'unauthenticated') return unauthenticated(store);
		return reauthenticationRequired(store, store.state.session?.email ?? '', guard.flows);
	}

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
						},
						mfa: { supported_types: [...MFA_TYPES] }
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
			// Unverified, or waiting for the two-factor code: the 401 lists the pending flow.
			if (result === 'unverified' || result === 'mfa') {
				return response.untyped(unauthenticated(store));
			}
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
					store.refuseSignup();
					return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
				}
				// Only the birth year and month are read. Nothing is stored but the refusal flag.
				const body = readObject(await readJson(request));
				const issues = birthIssues(body);
				if (issues.length > 0) return response.untyped(allauthErrors(store, issues));
				if (!isOldEnough(Number(body.birth_year), Number(body.birth_month))) {
					store.refuseSignup();
					return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
				}
				return response.untyped(allauthStatus(store, 200));
			}
		),

		http.post(
			'/_allauth/{client}/v1/auth/signup/password-check',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				if (store.currentAccount()) return response.untyped(allauthStatus(store, 409));
				if (store.state.signupRefused) {
					return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
				}
				// The same password rules as sign-up, with the email for the similarity rule. Nothing is
				// stored, and no Account is looked up by the email.
				const body = readObject(await readJson(request));
				const password = text(body.password);
				if (!password) return response.untyped(allauthErrors(store, [required('password')]));
				const issues = passwordErrors(password, text(body.email) ?? '').map((issue) => ({
					...issue,
					param: 'password'
				}));
				if (issues.length > 0) return response.untyped(allauthErrors(store, issues));
				return response.untyped(allauthStatus(store, 200));
			}
		),

		http.post('/_allauth/{client}/v1/auth/signup', async ({ request, cookies, response }) => {
			if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
			if (store.currentAccount()) return response.untyped(allauthStatus(store, 409));
			// The backend's age screen comes first. Once it refuses, every later sign-up in this
			// session gets the same answer, whatever is sent, and nothing is held.
			if (store.state.signupRefused) {
				store.refuseSignup();
				return response.untyped(allauthErrors(store, [SIGNUP_REFUSED]));
			}
			const body = readObject(await readJson(request));
			const ageIssues = signupAgeIssues(body);
			if (ageIssues.length > 0) return response.untyped(allauthErrors(store, ageIssues));
			if (!isOldEnough(Number(body.birth_year), Number(body.birth_month))) {
				store.refuseSignup();
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
			store.signup(email, password, signupDetails(body));
			return response.untyped(unauthenticated(store));
		}),

		// Two-factor (backend `apps/accounts/mfa_views.py`, ADR 0043).

		http.post(
			'/_allauth/{client}/v1/auth/2fa/authenticate',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				if (!store.pendingMfaAccount()) return response.untyped(allauthStatus(store, 409));
				const code = text(readObject(await readJson(request)).code);
				if (!code) return response.untyped(allauthErrors(store, [required('code')]));
				if (!store.completeMfaLogin(code)) {
					return response.untyped(allauthErrors(store, [incorrectCode()]));
				}
				const account = store.currentAccount();
				return response.untyped(
					authenticated(store, account?.email ?? '', store.state.session?.at ?? 0)
				);
			}
		),

		http.post(
			'/_allauth/{client}/v1/auth/reauthenticate',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const account = store.currentAccount();
				if (!account) return response.untyped(unauthenticated(store));
				const password = text(readObject(await readJson(request)).password);
				if (!password) return response.untyped(allauthErrors(store, [required('password')]));
				if (!store.reauthenticate(password)) {
					return response.untyped(allauthErrors(store, [incorrectPassword()]));
				}
				return response.untyped(authenticated(store, account.email, store.state.session?.at ?? 0));
			}
		),

		http.post(
			'/_allauth/{client}/v1/auth/2fa/reauthenticate',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const account = store.currentAccount();
				if (!account) return response.untyped(unauthenticated(store));
				const code = text(readObject(await readJson(request)).code);
				if (!code) return response.untyped(allauthErrors(store, [required('code')]));
				if (!store.reauthenticateMfa(code)) {
					return response.untyped(allauthErrors(store, [incorrectCode()]));
				}
				return response.untyped(authenticated(store, account.email, store.state.session?.at ?? 0));
			}
		),

		http.get('/_allauth/{client}/v1/account/authenticators', ({ response }) => {
			const account = store.currentAccount();
			if (!account) return response.untyped(unauthenticated(store));
			const list: object[] = [];
			if (account.totp) list.push(totpOut(account));
			if (account.recoveryCodes) {
				const codes: Partial<ReturnType<typeof recoveryCodesOut>> = recoveryCodesOut(account);
				delete codes.unused;
				list.push(codes);
			}
			return response.untyped(allauthJson(store, 200, { status: 200, data: list }));
		}),

		http.get('/_allauth/{client}/v1/account/authenticators/totp', ({ response }) => {
			const account = store.currentAccount();
			if (!account) return response.untyped(unauthenticated(store));
			if (account.totp) {
				return response.untyped(allauthJson(store, 200, { status: 200, data: totpOut(account) }));
			}
			const label = encodeURIComponent(`OPEN Pickleball:${account.email}`);
			return response.untyped(
				allauthJson(store, 404, {
					status: 404,
					meta: {
						secret: MOCK_TOTP_SECRET,
						totp_url: `otpauth://totp/${label}?secret=${MOCK_TOTP_SECRET}&issuer=OPEN+Pickleball`
					}
				})
			);
		}),

		http.post(
			'/_allauth/{client}/v1/account/authenticators/totp',
			async ({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const guard = store.guardMfaChange(true);
				if (!guard.ok) return response.untyped(refused(guard));
				const code = text(readObject(await readJson(request)).code);
				if (!code) return response.untyped(allauthErrors(store, [required('code')]));
				const result = store.activateTotp(guard.account, code);
				if (result === 'conflict') return response.untyped(allauthStatus(store, 409));
				if (result === 'incorrect') {
					return response.untyped(allauthErrors(store, [incorrectCode()]));
				}
				return response.untyped(
					allauthJson(store, 200, {
						status: 200,
						meta: { recovery_codes_generated: true },
						data: totpOut(guard.account)
					})
				);
			}
		),

		http.delete(
			'/_allauth/{client}/v1/account/authenticators/totp',
			({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const guard = store.guardMfaChange(true);
				if (!guard.ok) return response.untyped(refused(guard));
				store.deactivateTotp(guard.account);
				return response.untyped(allauthStatus(store, 200));
			}
		),

		http.get('/_allauth/{client}/v1/account/authenticators/recovery-codes', ({ response }) => {
			const guard = store.guardMfaChange(false);
			if (!guard.ok) return response.untyped(refused(guard));
			const codes = guard.account.recoveryCodes;
			if (!codes) return response.untyped(allauthStatus(store, 404));
			const { unused, ...out } = recoveryCodesOut(guard.account);
			// Shown once: after that allauth leaves `unused_codes` out, though the count stays.
			const shown = codes.viewed ? {} : { unused_codes: unused };
			codes.viewed = true;
			return response.untyped(allauthJson(store, 200, { status: 200, data: { ...out, ...shown } }));
		}),

		http.post(
			'/_allauth/{client}/v1/account/authenticators/recovery-codes',
			({ request, cookies, response }) => {
				if (!csrfValid(request, cookies, store)) return response.untyped(allauthCsrfFailed(store));
				const guard = store.guardMfaChange(true);
				if (!guard.ok) return response.untyped(refused(guard));
				if (!guard.account.totp) {
					return response.untyped(
						allauthErrors(store, [
							{ code: 'invalid', message: 'You cannot deactivate two-factor authentication.' }
						])
					);
				}
				guard.account.recoveryCodes = store.newRecoveryCodes();
				const { unused, ...out } = recoveryCodesOut(guard.account);
				guard.account.recoveryCodes.viewed = true;
				return response.untyped(
					allauthJson(store, 200, { status: 200, data: { ...out, unused_codes: unused } })
				);
			}
		),

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
