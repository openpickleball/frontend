import type { components } from './generated/allauth';

/** One allauth login flow, such as a pending `verify_email`. */
export type AllauthFlow = components['schemas']['Flow'];

export type AppErrorKind =
	| 'network'
	| 'unauthenticated'
	| 'forbidden'
	| 'csrf'
	| 'not_found'
	| 'conflict'
	| 'duplicate'
	| 'validation'
	| 'throttled'
	| 'server';

/** The fields of an `AppError`, as a plain object. */
export type AppErrorFields = {
	kind: AppErrorKind;
	/** HTTP status, or null for a network failure. */
	status: number | null;
	/** Backend code, such as 'duplicate_match' or 'tie'. Our own code for non-JSON failures. */
	code: string;
	/** Safe to show to a player. */
	message: string;
	/**
	 * Field path to messages. Ninja's `body.games.1` becomes `games.1`; allauth uses `param`.
	 * A key of `body` is a form-level error. `query.` and `path.` prefixes are kept.
	 */
	fields: Record<string, string[]>;
	/** Set on an allauth 401: the flows still pending, such as `verify_email`. */
	flows?: AllauthFlow[];
	/** Set on a Ninja 409 `duplicate_match` that names the earlier match: its OPEN code. */
	existingCode?: string;
	/** What the call threw when there was no response, kept for logging. Never shown. */
	cause?: unknown;
};

/**
 * The one error type every failed API call becomes. It is a real `Error`, so it has a stack and
 * a name for the console and error reporting. Check for it with `isAppError`, which also accepts
 * a plain object with the same fields (as tests build them).
 */
export class AppError extends Error implements AppErrorFields {
	kind: AppErrorKind;
	status: number | null;
	code: string;
	fields: Record<string, string[]>;
	declare flows?: AllauthFlow[];
	declare existingCode?: string;

	constructor(fields: AppErrorFields) {
		super(fields.message, fields.cause === undefined ? undefined : { cause: fields.cause });
		this.name = 'AppError';
		this.kind = fields.kind;
		this.status = fields.status;
		this.code = fields.code;
		this.fields = fields.fields;
		if (fields.flows) this.flows = fields.flows;
		if (fields.existingCode) this.existingCode = fields.existingCode;
	}
}

/**
 * What a player reads for each kind: what happened and what to do next. Only `validation` and
 * `duplicate` show the backend's own text, because it names the field or the match. Every other
 * kind uses these, so a player never sees text such as "Internal".
 */
const MESSAGES: Record<AppErrorKind, string> = {
	network: "We can't reach the server. Check your connection and try again.",
	unauthenticated: "You're not signed in. Sign in, then try again.",
	// Most 403s are a match permission refusal. `POST me/player` also sends one for an unverified
	// email; `MyCode` shows its own copy for that one, not this message.
	forbidden: "You can't do that. Only the players in a match can change it.",
	csrf: 'Your session check failed. Reload the page, then try again.',
	not_found: "We can't find that. Check the link, or go back to your matches.",
	conflict: "That can't be done right now. Reload the page to see the latest, then try again.",
	duplicate: 'That has already been recorded.',
	validation: 'Please check the highlighted fields.',
	throttled: 'Too many attempts. Wait a moment and try again.',
	server: 'Something went wrong on our side. Wait a moment, then try again.'
};

/** A validation error with no field to highlight. */
const FORM_MESSAGE = "Something you entered wasn't accepted. Check it and try again.";

/** A request that got no answer in time. */
const TIMEOUT_MESSAGE =
	'The server is taking too long to answer. Check your connection and try again.';

/**
 * allauth answers too many failed sign-ins with a 400 and this code. It is a lockout, so it is a
 * `throttled` error, with allauth's own text, which says it was the sign-ins.
 */
const LOGIN_LOCKOUT = 'too_many_login_attempts';

/** The message for an error. `serverText` is the backend's own message, if it sent one. */
function messageFor(
	kind: AppErrorKind,
	code: string,
	fields: Record<string, string[]>,
	serverText?: string
): string {
	if (code === LOGIN_LOCKOUT && serverText) return serverText;
	if ((kind === 'validation' || kind === 'duplicate') && serverText) return serverText;
	if (kind === 'validation' && Object.keys(fields).length === 0) return FORM_MESSAGE;
	return MESSAGES[kind];
}

/**
 * Is this an `AppError`? Also true for a plain object with the same fields, such as one a test
 * builds by hand. Such an object has no stack; `toAppError` turns it into a real `AppError`.
 */
export function isAppError(value: unknown): value is AppError {
	if (value instanceof AppError) return true;
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.kind === 'string' &&
		typeof v.code === 'string' &&
		typeof v.message === 'string' &&
		typeof v.fields === 'object' &&
		v.fields !== null &&
		'status' in v
	);
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Is this response a CSRF failure?
 *
 * Ninja answers `403 {"code":"forbidden","message":"CSRF check Failed"}`. allauth's
 * headless views go through Django's CSRF middleware, which answers with an HTML 403
 * page. Any other JSON 403 (a match permission refusal, or `POST me/player` for an email that
 * is not verified) is a plain `forbidden`.
 *
 * `body` is what openapi-fetch hands back: parsed JSON, or the raw text when the body
 * is not JSON.
 */
export function isCsrfFailure(status: number, body: unknown): boolean {
	if (status !== 403) return false;
	if (isObject(body)) return /csrf/i.test(str(body.message) ?? '');
	return typeof body === 'string' && body !== '';
}

function addField(fields: Record<string, string[]>, field: string, message: string): void {
	(fields[field] ??= []).push(message);
}

function stripBody(field: string): string {
	return field.replace(/^body\./, '');
}

function kindForStatus(status: number, body: unknown, code: string): AppErrorKind {
	if (isCsrfFailure(status, body)) return 'csrf';
	if (code === LOGIN_LOCKOUT) return 'throttled';
	switch (status) {
		case 400:
		case 422:
			return 'validation';
		case 401:
		case 410:
			return 'unauthenticated';
		case 403:
			return 'forbidden';
		case 404:
			return 'not_found';
		case 409:
			return code.startsWith('duplicate') ? 'duplicate' : 'conflict';
		case 429:
			return 'throttled';
		default:
			return 'server';
	}
}

/** Ninja: `{code, message, errors: [{field, code, message, existing_code?}]}`. */
function fromNinja(status: number, body: Json): AppError {
	const code = str(body.code) ?? 'error';
	const kind = kindForStatus(status, body, code);
	const fields: Record<string, string[]> = {};
	let existingCode: string | undefined;
	const items = Array.isArray(body.errors) ? body.errors : [];
	for (const item of items) {
		if (!isObject(item)) continue;
		const field = str(item.field);
		const message = str(item.message);
		if (field && message) addField(fields, stripBody(field), message);
		existingCode ??= str(item.existing_code);
	}
	const message = messageFor(kind, code, fields, str(body.message));
	return new AppError({
		kind,
		status,
		code,
		message,
		fields,
		...(existingCode ? { existingCode } : {})
	});
}

function codeForStatus(status: number): string {
	if (status === 401) return 'unauthenticated';
	if (status === 410) return 'session_gone';
	if (status === 429) return 'throttled';
	return 'error';
}

/** allauth: `{status, errors: [{code, param, message}]}` or a 401 `{status, data: {flows}, meta}`. */
function fromAllauth(status: number, body: Json): AppError {
	const items = Array.isArray(body.errors) ? body.errors.filter(isObject) : [];
	const first = items[0];
	const code = str(first?.code) ?? codeForStatus(status);
	const kind = kindForStatus(status, body, code);
	const fields: Record<string, string[]> = {};
	for (const item of items) {
		const param = str(item.param);
		const message = str(item.message);
		if (param && message) addField(fields, param, message);
	}
	const flows =
		isObject(body.data) && Array.isArray(body.data.flows)
			? (body.data.flows as AllauthFlow[])
			: undefined;
	return new AppError({
		kind,
		status,
		code,
		message: messageFor(kind, code, fields, str(first?.message)),
		fields,
		...(flows ? { flows } : {})
	});
}

function isNinjaBody(body: Json): boolean {
	return typeof body.code === 'string' && typeof body.message === 'string';
}

/**
 * A request that got no answer, because `fetch` itself rejected. The API clients turn that
 * rejection into this error (see `client.ts`), so nothing else is mistaken for it.
 */
export function networkError(cause?: unknown): AppError {
	return new AppError({
		kind: 'network',
		status: null,
		code: 'network_error',
		message: MESSAGES.network,
		fields: {},
		cause
	});
}

/**
 * A request the client gave up on because no answer came in time (see `client.ts`). It is a
 * `network` error, so screens offer to try again, with code `timeout` and its own message.
 */
export function timeoutError(cause?: unknown): AppError {
	return new AppError({
		kind: 'network',
		status: null,
		code: 'timeout',
		message: TIMEOUT_MESSAGE,
		fields: {},
		cause
	});
}

/** A request that was cancelled or timed out on purpose, not lost. */
export function isAbortError(cause: unknown): boolean {
	return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError');
}

/**
 * Turn a failed call into an `AppError`.
 *
 * Pass what openapi-fetch returned: `error` (parsed JSON, raw text for a non-JSON body,
 * or undefined for an empty one) and `response`. With no `response`, `error` is what the
 * call rejected with. A lost connection already arrives as a `network` AppError. Anything
 * else, such as a 200 that is not JSON (a `SyntaxError`), an aborted request or a bug in a
 * middleware, is not a connection problem, so it is a `server` error with a generic message.
 */
export function toAppError(error: unknown, response?: Response): AppError {
	if (error instanceof AppError) return error;
	if (isAppError(error)) return new AppError(error);
	if (!response) {
		const code =
			error instanceof SyntaxError
				? 'bad_response'
				: isAbortError(error)
					? 'aborted'
					: 'unexpected';
		return new AppError({
			kind: 'server',
			status: null,
			code,
			message: MESSAGES.server,
			fields: {},
			cause: error
		});
	}
	const { status } = response;
	if (isObject(error)) {
		if (isNinjaBody(error)) return fromNinja(status, error);
		if (typeof error.status === 'number') return fromAllauth(status, error);
	}
	// Not JSON (a plain-text 405, Django's HTML 404, a 500), an empty body, or an
	// unknown JSON shape: use a generic message, never the raw body.
	const kind = kindForStatus(status, error, 'non_json');
	const code = kind === 'csrf' ? 'csrf_failed' : status === 429 ? 'throttled' : 'non_json_response';
	return new AppError({ kind, status, code, message: messageFor(kind, code, {}), fields: {} });
}
