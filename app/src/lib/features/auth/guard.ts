/**
 * Which pages need a signed-in player, and where to send everyone else. Pure functions,
 * so they are easy to test. The layout load applies them.
 */

import { ROUTES } from '#lib/domain/index.js';

export const LOGIN_PATH = ROUTES.login;

const GUARDED_BASES: readonly string[] = [ROUTES.record, ROUTES.matches, ROUTES.profile];

function under(pathname: string, base: string): boolean {
	return pathname === base || pathname.startsWith(`${base}/`);
}

/** The account pages (sign in, sign up, verify, reset). They are for signed-out players. */
export function isAccountPath(pathname: string): boolean {
	return under(pathname, ROUTES.account);
}

/**
 * The account pages a signed-in player has no use for. The verify and reset-key pages are
 * left out: the backend allows changing an email, so a signed-in player can get a verify link.
 */
const SIGNED_OUT_ONLY: readonly string[] = [ROUTES.login, ROUTES.signup, ROUTES.passwordReset];

export function isSignedOutOnlyPath(pathname: string): boolean {
	return SIGNED_OUT_ONLY.includes(pathname.replace(/\/+$/, ''));
}

/** Does this page need a signed-in player? Home, record, matches (and one match) and profile do. */
export function isGuardedPath(pathname: string): boolean {
	return pathname === ROUTES.home || GUARDED_BASES.some((base) => under(pathname, base));
}

/**
 * `next` from a query string, only if it is safe to send the player there: a path on this
 * site. Anything else (another site, `//host`, `/\host`, a scheme, control characters, an
 * account page that would just bounce back) returns null.
 */
export function safeNext(raw: string | null | undefined): string | null {
	if (!raw || raw.length > 2048) return null;
	// Only a path that starts with exactly one slash. No backslashes or control characters,
	// which some browsers treat as a slash or strip.
	// eslint-disable-next-line no-control-regex
	if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL(raw, 'http://open.invalid');
	} catch {
		return null;
	}
	if (parsed.origin !== 'http://open.invalid') return null;
	// URL parsing resolves dot segments, so `/..//host` becomes `//host`, which a browser reads
	// as another site. Check the path after parsing, not only the raw string.
	if (/^\/[/\\]/.test(parsed.pathname)) return null;
	if (isAccountPath(parsed.pathname)) return null;
	return parsed.pathname + parsed.search + parsed.hash;
}

/** The sign-in page, remembering where the player was going. */
export function loginUrl(next: string): string {
	const safe = safeNext(next);
	return safe && safe !== '/' ? `${LOGIN_PATH}?next=${encodeURIComponent(safe)}` : LOGIN_PATH;
}

/**
 * Where a visit should go instead, or null to show the page.
 * - Signed out on a signed-in page: the sign-in page, with `next`.
 * - Signed in on the sign-in, sign-up or reset-request page: home.
 */
export function redirectFor(
	url: Pick<URL, 'pathname' | 'search'>,
	signedIn: boolean
): string | null {
	if (signedIn) return isSignedOutOnlyPath(url.pathname) ? ROUTES.home : null;
	if (isGuardedPath(url.pathname)) return loginUrl(url.pathname + url.search);
	return null;
}
