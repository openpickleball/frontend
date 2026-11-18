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
	| 'server';

/** The one error type every failed API call becomes. */
export type AppError = {
	kind: AppErrorKind;
	/** HTTP status, or null for a network failure. */
	status: number | null;
	/** Backend code, such as 'duplicate_match' or 'tie'. Our own code for non-JSON failures. */
	code: string;
	/** Safe to show to a player. */
	message: string;
	/** Field path to messages. Ninja's `body.games.1` becomes `games.1`; allauth uses `param`. */
	fields: Record<string, string[]>;
	/** Set on an allauth 401: the flows still pending, such as `verify_email`. */
	flows?: AllauthFlow[];
};

const MESSAGES: Record<AppErrorKind, string> = {
	network: "We can't reach the server. Check your connection and try again.",
	unauthenticated: 'Please sign in to continue.',
	forbidden: "You can't do that.",
	csrf: 'Your session check failed. Please try again.',
	not_found: "We can't find that.",
	conflict: "That can't be done right now.",
	duplicate: 'That has already been recorded.',
	validation: 'Please check the highlighted fields.',
	server: 'Something went wrong on our side. Please try again.'
};

export function isAppError(value: unknown): value is AppError {
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
 * page. Any other JSON 403 (a match permission refusal) is a plain `forbidden`.
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
		default:
			return 'server';
	}
}

/** Ninja: `{code, message, errors: [{field, code, message}]}`. */
function fromNinja(status: number, body: Json): AppError {
	const code = str(body.code) ?? 'error';
	const kind = kindForStatus(status, body, code);
	const fields: Record<string, string[]> = {};
	const items = Array.isArray(body.errors) ? body.errors : [];
	for (const item of items) {
		if (!isObject(item)) continue;
		const field = str(item.field);
		const message = str(item.message);
		if (field && message) addField(fields, stripBody(field), message);
	}
	return { kind, status, code, message: str(body.message) ?? MESSAGES[kind], fields };
}

/** allauth: `{status, errors: [{code, param, message}]}` or a 401 `{status, data: {flows}, meta}`. */
function fromAllauth(status: number, body: Json): AppError {
	const items = Array.isArray(body.errors) ? body.errors.filter(isObject) : [];
	const first = items[0];
	const code = str(first?.code) ?? (status === 401 ? 'unauthenticated' : 'error');
	const kind = kindForStatus(status, body, code);
	const fields: Record<string, string[]> = {};
	for (const item of items) {
		const param = str(item.param);
		const message = str(item.message);
		if (param && message) addField(fields, param, message);
	}
	const error: AppError = {
		kind,
		status,
		code,
		message: str(first?.message) ?? MESSAGES[kind],
		fields
	};
	if (isObject(body.data) && Array.isArray(body.data.flows)) {
		error.flows = body.data.flows as AllauthFlow[];
	}
	return error;
}

function isNinjaBody(body: Json): boolean {
	return typeof body.code === 'string' && typeof body.message === 'string';
}

/**
 * Turn a failed call into an `AppError`.
 *
 * Pass what openapi-fetch returned: `error` (parsed JSON, raw text for a non-JSON body,
 * or undefined for an empty one) and `response`. With no `response`, `error` is what
 * `fetch` rejected with, which is a network failure.
 */
export function toAppError(error: unknown, response?: Response): AppError {
	if (isAppError(error)) return error;
	if (!response) {
		return {
			kind: 'network',
			status: null,
			code: 'network_error',
			message: MESSAGES.network,
			fields: {}
		};
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
	return { kind, status, code, message: MESSAGES[kind], fields: {} };
}
