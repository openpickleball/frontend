import { allauthParams, api, isAppError, unwrap } from '#lib/api/index.js';

/**
 * Who is signed in, as far as this feature needs to know: an email, to scope the code kept on
 * the device. `null` means nobody is signed in.
 *
 * `features/auth` is built separately, so this feature does not import it. The layout (or
 * whatever owns the session) calls `setAccountEmailSource(() => session.email)` once, and the
 * players feature follows it. Until then the default asks allauth for the session itself.
 *
 * Call `setAccountEmailSource` at the top level of the root layout's `<script>`, never in
 * `onMount`: a child's `onMount` runs before its parent's, so the profile would load first. The
 * source must return a promise that resolves once the session is known. It must never return
 * `null` while the session is still loading, because `null` means signed out. The default throws
 * on anything but a 401, so being offline shows the error state, not "Sign in".
 */
export type AccountEmailSource = () =>
	string | null | undefined | Promise<string | null | undefined>;

async function fromAllauthSession(): Promise<string | null> {
	try {
		const session = await unwrap(
			api.allauth.GET('/_allauth/{client}/v1/auth/session', { params: allauthParams })
		);
		return session.data.user.email ?? null;
	} catch (error) {
		// Signed out is a 401. Anything else (offline, a server error) is not "signed out".
		if (isAppError(error) && error.kind === 'unauthenticated') return null;
		throw error;
	}
}

let source: AccountEmailSource = fromAllauthSession;

/** Replace where the account email comes from. Pass `null` to go back to the default. */
export function setAccountEmailSource(next: AccountEmailSource | null): void {
	source = next ?? fromAllauthSession;
}

/** Throws if the source fails (for example offline). */
export async function currentAccountEmail(): Promise<string | null> {
	return (await source()) || null;
}
