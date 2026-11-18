import { isAppError, type AppError } from '#lib/api/index.js';

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
	if (isAppError(cause)) return cause;
	return {
		kind: 'server',
		status: null,
		code: 'unexpected',
		message: 'Something went wrong. Please try again.',
		fields: {}
	};
}

/** Move focus to the first field in `order` that has an error, once the page has updated. */
export function focusFirstError(errors: Record<string, string>, order: string[], prefix: string) {
	const name = order.find((field) => errors[field]);
	if (!name) return;
	queueMicrotask(() => document.getElementById(`${prefix}-${name}`)?.focus());
}

/** Too many attempts: a 429, whatever code the backend gave it (`toAppError` uses `throttled` when it gave none). */
export function isThrottled(error: AppError): boolean {
	return error.status === 429 || error.code === 'throttled';
}
