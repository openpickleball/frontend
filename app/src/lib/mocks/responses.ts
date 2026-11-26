/**
 * Response bodies in the shapes the backend sends. Read from its source:
 *
 * - `config/api_errors.py`: the OPEN API's `ErrorResponse`, `{code, message, errors}`.
 * - `config/auth.py`: ninja's 401 and the CSRF 403 (`CSRF check Failed`).
 * - django-allauth headless (`allauth/headless/base/response.py`): `{status, data, meta}`
 *   for authentication, `{status, errors: [{code, param, message}]}` for 400.
 *
 * allauth's browser views are not CSRF exempt, so a missing token gets Django's HTML 403 page.
 */
import { HttpResponse } from 'msw';
import { CSRF_COOKIE_NAME } from '../api/csrf';
import type { FieldIssue, MockStore } from './store';

// OPEN API (ninja)

export function ninjaError(
	status: number,
	code: string,
	message: string,
	errors: FieldIssue[] = []
): Response {
	return HttpResponse.json({ code, message, errors }, { status });
}

export const unauthorized = () => ninjaError(401, 'unauthorized', 'Authentication required.');

export const csrfFailed = () => ninjaError(403, 'forbidden', 'CSRF check Failed');

export const notFound = () => ninjaError(404, 'not_found', 'Not found.');

export const validationError = (errors: FieldIssue[]) =>
	ninjaError(422, 'validation_error', 'The request is not valid.', errors);

/** `MatchPermissionDenied`: fixed text, never which rule failed. */
export const cannotSubmit = () =>
	ninjaError(403, 'forbidden', 'You are not allowed to submit this match.');

/** `MatchStateError`. */
export const stateConflict = () =>
	ninjaError(409, 'conflict', 'This match cannot make this change in its current status.');

/**
 * `DuplicateMatchError`: names the earlier match, which the submitter played in, in the message
 * and as the item's `existing_code`.
 */
export function duplicateMatch(existingCode: string): Response {
	const message = `This match was already submitted as ${existingCode}.`;
	return ninjaError(409, 'duplicate_match', message, [
		{ field: 'match', code: 'duplicate_match', message, existing_code: existingCode }
	]);
}

// allauth headless

/** Django sets the CSRF cookie on every browser view (`get_token`). */
function csrfCookie(store: MockStore): string {
	// The mocks stand in for a local backend (DEBUG on), so the cookie keeps the local name.
	return `${CSRF_COOKIE_NAME}=${store.state.csrfToken}; Path=/; SameSite=Lax`;
}

export function allauthJson(store: MockStore, status: number, body: object): Response {
	return HttpResponse.json(body, { status, headers: { 'Set-Cookie': csrfCookie(store) } });
}

/** Django's CSRF failure page: HTML, not JSON. */
export function allauthCsrfFailed(store: MockStore): Response {
	return new HttpResponse(
		'<!doctype html><html lang="en"><head><title>403 Forbidden</title></head>' +
			'<body><h1>Forbidden (403)</h1><p>CSRF verification failed. Request aborted.</p></body></html>',
		{
			status: 403,
			headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': csrfCookie(store) }
		}
	);
}

export type AllauthIssue = { code: string; message: string; param?: string };

/** `ErrorResponse`: a 400 with the problems found. */
export function allauthErrors(store: MockStore, errors: AllauthIssue[]): Response {
	return allauthJson(store, 400, { status: 400, errors });
}

export const required = (param: string): AllauthIssue => ({
	code: 'required',
	message: 'This field is required.',
	param
});

export const invalidEmail = (): AllauthIssue => ({
	code: 'invalid',
	message: 'Enter a valid email address.',
	param: 'email'
});

/** A bare status body, such as the 409 `ConflictResponse`. */
export const allauthStatus = (store: MockStore, status: number) =>
	allauthJson(store, status, { status });

export function userOut(email: string) {
	return { display: email, email, has_usable_password: true };
}

/** The flows an unauthenticated session can start, plus the pending email verification. */
export function flows(store: MockStore) {
	const list: { id: string; is_pending?: true }[] = [{ id: 'login' }, { id: 'signup' }];
	if (store.state.pendingEmail) list.push({ id: 'verify_email', is_pending: true });
	return list;
}

/** `AuthenticationResponse`: 401 with the flows, whenever nobody is signed in. */
export function unauthenticated(store: MockStore): Response {
	return allauthJson(store, 401, {
		status: 401,
		data: { flows: flows(store) },
		meta: { is_authenticated: false }
	});
}

/** `AuthenticatedResponse`: 200 for a signed-in session. */
export function authenticated(store: MockStore, email: string, at: number): Response {
	return allauthJson(store, 200, {
		status: 200,
		data: { user: userOut(email), methods: [{ method: 'password', at, email }] },
		meta: { is_authenticated: true }
	});
}
