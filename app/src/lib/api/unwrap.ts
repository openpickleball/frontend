import { toAppError } from './errors';

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Await an openapi-fetch call and return its data, or throw an `AppError`
 * (a rejected fetch becomes a `network` error).
 */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
	let result: Result<T>;
	try {
		result = await call;
	} catch (cause) {
		throw toAppError(cause);
	}
	if (!result.response.ok) throw toAppError(result.error, result.response);
	return result.data as T;
}
