/**
 * Authentication. The only file other code imports from this feature.
 *
 * For other features and pages:
 * - `session`: the signed-in state, a runes store. `session.status` is `signed_out`,
 *   `pending_verification` or `signed_in` (`unknown` only before the first load).
 *   `session.isSignedIn` is the quick check and `session.email` is the account's address
 *   when signed in. Reading them in a component or `$derived` stays reactive.
 * - `requireSession(url)`: for a `load` function that needs a signed-in player. Resolves
 *   to the account's email, or redirects to sign in and back to `url` afterwards.
 *   Layout and page loads run in parallel, so call it first in a page load that calls
 *   the API: the layout's own guard may not have redirected yet.
 * - `sessionEmail()`: the account email as a promise that waits for the session. Hand it to
 *   `setAccountEmailSource` (the root layout does).
 * - `SignOutButton`: a sign out button, for the profile page.
 *
 * The routes use the rest: the forms and the layout guard.
 */
import { redirect } from '@sveltejs/kit';
import { loginUrl, redirectFor } from './guard.js';
import { session } from './session.svelte.js';
import { bootstrap } from './services.js';

export { session, type SessionStatus } from './session.svelte.js';
export { isAccountPath, safeNext } from './guard.js';
export { default as SignOutButton } from './components/sign-out-button.svelte';
export { default as LoginForm } from './components/login-form.svelte';
export { default as SignupForm } from './components/signup-form.svelte';
export { default as VerifyEmail } from './components/verify-email.svelte';
export { default as ResetRequestForm } from './components/reset-request-form.svelte';
export { default as ResetForm } from './components/reset-form.svelte';

/**
 * Read the session once (and set up CSRF), then redirect if this visit isn't allowed:
 * a signed-out player on a signed-in page goes to sign in, and a signed-in player on
 * an account page goes home. Called by the root layout's `load`.
 */
export async function enforceGuard(url: Pick<URL, 'pathname' | 'search'>): Promise<void> {
	await bootstrap();
	const to = redirectFor(url, session.isSignedIn);
	if (to) redirect(307, to);
}

/**
 * The signed-in account's email, for code that wants to scope data to the account (such as
 * `setAccountEmailSource` in features/players). Waits for the session to be read. `null` means
 * signed out. If the session could not be read at all (the backend is unreachable) it throws,
 * so callers show an error instead of treating the player as signed out.
 */
export async function sessionEmail(): Promise<string | null> {
	await bootstrap();
	if (session.status === 'unknown') {
		throw new Error('The session could not be read.');
	}
	return session.isSignedIn ? session.email : null;
}

/**
 * Make sure a player is signed in. Resolves to their email. Otherwise it redirects to
 * the sign-in page with `next` set to this page, so they come back after signing in.
 */
export async function requireSession(url: Pick<URL, 'pathname' | 'search'>): Promise<string> {
	await bootstrap();
	if (!session.isSignedIn || !session.email) {
		redirect(307, loginUrl(url.pathname + url.search));
	}
	return session.email;
}
