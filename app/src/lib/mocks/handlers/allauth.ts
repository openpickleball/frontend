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
			const body = readObject(await readJson(request));
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
