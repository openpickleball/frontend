/**
 * Authentication. The only file other code imports from this feature.
 *
 * For other features and pages:
 * - `session`: the signed-in state, a runes store. `session.status` is `signed_out`,
 *   `pending_verification`, `pending_mfa` (a login waiting for its two-factor code) or
 *   `signed_in` (`unknown` before the first load, or when the
 *   session could not be read: the guard treats that as signed out, and `SessionCheck` on the
 *   sign-in page says so).
 *   `session.isSignedIn` is the quick check and `session.email` is the account's address
 *   when signed in. Reading them in a component or `$derived` stays reactive.
 * - `requireSession(url)`: for a `load` function that needs a signed-in player. Resolves
 *   to the account's email, or redirects to sign in and back to `url` afterwards.
 *   Layout and page loads run in parallel, so call it first in a page load that calls
 *   the API: the layout's own guard may not have redirected yet.
 * - `SignOutButton`: a sign out button. The side nav and the profile page show it.
 * - `onSignOut(listener)`: the root layout calls it once, so the player's code is cleared as soon
 *   as the player signs out on purpose or deletes their account.
 * - `setSignOutWarning(source)`: what a sign out would delete from this device, such as unsent
 *   matches. Every `SignOutButton` asks first when `source` returns a warning.
 * - `setUnsentMatchesSource(source)` and `unsentMatches()`: how many matches on this device are
 *   unsent. The root layout sets the source once, and deleting the account warns with it.
 * - `deleteAccount()`: delete the signed-in account. Run it through `withReauth`. On 204 it calls
 *   `endDeletedAccount()`, which runs the `onSignOut` listeners, signs out and sets
 *   `session.accountDeleted`, so sign-in can say the account was deleted.
 * - `DeleteAccountDialog`: the "Delete your account" confirm dialog. It asks for the word
 *   `delete`, runs `deleteAccount()` through `withReauth`, then goes to sign in. Profile renders
 *   its row as the `trigger`.
 * - `goAfterSignIn(searchParams)`: go to `next`, or home, once signed in. The sign-in and
 *   sign-up pages call it.
 * - `watchSessionExpiry(onExpired)`: the root layout calls it once. The first 401 from the API
 *   marks the session signed out (so the layout clears the player's code and cached matches)
 *   and calls `onExpired`, which re-runs the guard to send the player to sign in.
 *
 * - `withReauth(call)`: run a call that may need a recent reauthentication (the password or a
 *   two-factor code). It asks the player with `ReauthPrompt`, which the root layout mounts once,
 *   then sends the call again. On Cancel it throws `ReauthCancelled`, which callers ignore.
 *   `requestReauth(methods)` opens the same prompt directly.
 *
 * - `checkMfaEnrolled()`: ask the backend again whether two-factor is on, and keep
 *   `session.mfaEnrolled` current. The code gate calls it when the value is unknown.
 * - `watchMfaRequired(notify)`: the root layout calls it once, and explains every 403
 *   `mfa_required` in one toast.
 * - `session.isMemberOf(code)`: is the account a member of that organizer? Display only.
 * - `organizerMemberships(url)`: for a `load` that depends on the memberships. Like
 *   `requireSession`, then waits until the memberships are known. Empty for a non-member.
 * - `loadAccountState()`: read the memberships and two-factor state again, such as after the
 *   backend refused an organizer action.
 * - `OrganizerMfaPrompt`: tells an organizer member without two-factor that organizer actions
 *   need it. Display only.
 *
 * The routes use the rest: the forms and the layout guard.
 */
import { redirect } from '@sveltejs/kit';
import { loginUrl, redirectFor } from './guard.js';
import type { ApiOption } from '#lib/api/index.js';
import { session, type OrganizerMembership } from './session.svelte.js';
import { bootstrap, settledMemberships } from './services.js';

export {
	session,
	type MfaType,
	type OrganizerMembership,
	type SessionStatus
} from './session.svelte.js';
export {
	checkMfaEnrolled,
	loadAccountState,
	watchMfaRequired,
	watchSessionExpiry,
	onSignOut,
	setSignOutWarning,
	deleteAccount,
	endDeletedAccount,
	setUnsentMatchesSource,
	unsentMatches
} from './services.js';
export { isAccountPath, safeNext } from './guard.js';
export { goAfterSignIn } from './navigation.js';
export { default as SignOutButton } from './components/sign-out-button.svelte';
export { default as DeleteAccountDialog } from './components/delete-account-dialog.svelte';
export { default as LoginForm } from './components/login-form.svelte';
export { default as SignupForm } from './components/signup-form.svelte';
export { default as VerifyEmail } from './components/verify-email.svelte';
export { default as ResetRequestForm } from './components/reset-request-form.svelte';
export { default as ResetForm } from './components/reset-form.svelte';
export { default as SessionCheck } from './components/session-check.svelte';
export { default as ReauthPrompt } from './components/reauth-prompt.svelte';
export { default as TwoFactorSettings } from './components/two-factor-settings.svelte';
export { default as OrganizerMfaPrompt } from './components/organizer-mfa-prompt.svelte';
export { ReauthCancelled, reauthPrompt, requestReauth, withReauth } from './reauth.svelte.js';

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
 * Make sure a player is signed in. Resolves to their email. Otherwise it redirects to
 * the sign-in page with `next` set to this page, so they come back after signing in.
 */
export async function requireSession(
	url: Pick<URL, 'pathname' | 'search'>,
	options: ApiOption = {}
): Promise<string> {
	await bootstrap(options);
	if (!session.isSignedIn || !session.email) {
		redirect(307, loginUrl(url.pathname + url.search));
	}
	return session.email;
}

/**
 * For a page only organizer members have: `requireSession`, then the account's memberships once
 * they are known (it waits for the read sign-in started). Empty for a non-member and when the
 * read failed. Display only: the backend decides what a member may do.
 */
export async function organizerMemberships(
	url: Pick<URL, 'pathname' | 'search'>,
	options: ApiOption = {}
): Promise<OrganizerMembership[]> {
	await requireSession(url, options);
	return settledMemberships(options);
}
