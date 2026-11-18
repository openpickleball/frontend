/**
 * Who is signed in, as far as this feature needs to know: an email, to scope the code kept on
 * the device. `null` means nobody is signed in.
 *
 * `features/auth` is built separately, so this feature does not import it. The layout (or
 * whatever owns the session) calls `setAccountEmailSource(() => session.email)` once, and the
 * players feature follows it. The root layout does this with `sessionEmail` from `features/auth`.
 *
 * Call `setAccountEmailSource` at the top level of the root layout's `<script>`, never in
 * `onMount`: a child's `onMount` runs before its parent's, so the profile would load first. The
 * source must return a promise that resolves once the session is known. It must never return
 * `null` while the session is still loading, because `null` means signed out. With no source set it
 * throws, so a missing setup shows the error state, not "Sign in".
 */
export type AccountEmailSource = () =>
	string | null | undefined | Promise<string | null | undefined>;

function notSet(): never {
	throw new Error('setAccountEmailSource() was not called. The root layout sets it.');
}

let source: AccountEmailSource = notSet;

/** Replace where the account email comes from. Pass `null` to clear it. */
export function setAccountEmailSource(next: AccountEmailSource | null): void {
	source = next ?? notSet;
}

/** Throws if the source fails (for example offline). */
export async function currentAccountEmail(): Promise<string | null> {
	return (await source()) || null;
}
