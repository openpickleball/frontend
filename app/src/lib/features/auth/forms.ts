import { AppError, isAppError } from '#lib/api/index.js';

/** The first message for each field, from a Zod result's `issues`. */
export function issueMessages(
	issues: readonly { path: readonly PropertyKey[]; message: string }[]
): Record<string, string> {
	const messages: Record<string, string> = {};
	for (const issue of issues) {
		const name = String(issue.path[0] ?? '');
		if (name && !(name in messages)) messages[name] = issue.message;
	}
	return messages;
}

/** The first message for each field, from an `AppError`. */
export function serverMessages(error: AppError): Record<string, string> {
	const messages: Record<string, string> = {};
	for (const [name, list] of Object.entries(error.fields)) {
		if (list[0]) messages[name] = list[0];
	}
	return messages;
}

/** Anything thrown by a service, as an `AppError`. Other errors become a plain server error. */
export function asAppError(cause: unknown): AppError {
	if (cause instanceof AppError) return cause;
	if (isAppError(cause)) return new AppError(cause);
	return new AppError({
		kind: 'server',
		status: null,
		code: 'unexpected',
		message: 'Something went wrong. Try again.',
		fields: {},
		cause
	});
}

/** Move focus to the first field in `order` that has an error, once the page has updated. */
export function focusFirstError(errors: Record<string, string>, order: string[], prefix: string) {
	const name = order.find((field) => errors[field]);
	if (!name) return;
	queueMicrotask(() => document.getElementById(`${prefix}-${name}`)?.focus());
}

/**
 * Too many attempts. `toAppError` gives both kinds of limit the `throttled` kind: a 429 (allauth
 * answers a bare `{"status":429}`) and a login lockout (a 400 with code `too_many_login_attempts`).
 */
export function isThrottled(error: AppError): boolean {
	return error.kind === 'throttled';
}
