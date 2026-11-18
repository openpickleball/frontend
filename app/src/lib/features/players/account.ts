import { allauthParams, api, unwrap } from '#lib/api/index.js';

/**
 * Who is signed in, as far as this feature needs to know: an email, to scope the code kept on
 * the device. `null` means nobody is signed in.
 *
 * `features/auth` is built separately, so this feature does not import it. The layout (or
 * whatever owns the session) calls `setAccountEmailSource(() => session.email)` once, and the
 * players feature follows it. Until then the default asks allauth for the session itself.
 */
export type AccountEmailSource = () =>
	string | null | undefined | Promise<string | null | undefined>;

async function fromAllauthSession(): Promise<string | null> {
	try {
		const session = await unwrap(
			api.allauth.GET('/_allauth/{client}/v1/auth/session', { params: allauthParams })
		);
		return session.data.user.email ?? null;
	} catch {
		return null;
	}
}

let source: AccountEmailSource = fromAllauthSession;

/** Replace where the account email comes from. Pass `null` to go back to the default. */
export function setAccountEmailSource(next: AccountEmailSource | null): void {
	source = next ?? fromAllauthSession;
}

export async function currentAccountEmail(): Promise<string | null> {
	return (await source()) || null;
}
