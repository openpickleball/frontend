import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { safeNext } from './guard.js';

/**
 * Go where the player was headed once they are signed in: `next` from the query string, but
 * only a path on this site, otherwise home. Sign in and sign up both use it.
 */
export function goAfterSignIn(search: Pick<URLSearchParams, 'get'>): Promise<void> {
	const next = safeNext(search.get('next')) ?? '/';
	// If that page can't be opened, go home rather than leave a signed-in player on Sign in.
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- safeNext() allows only same-site paths
	return goto(next).catch(() => goto(resolve('/')));
}
