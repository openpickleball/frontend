import { enforceGuard } from '#lib/features/auth/index.js';
import type { LayoutLoad } from './$types';

// Single-page app: the build is static and the browser renders every route.
export const ssr = false;

// Reads the session once, then sends signed-out players to sign in (and signed-in players
// away from the account pages). `url` makes this run again on every navigation.
export const load: LayoutLoad = async ({ url }) => {
	await enforceGuard(url);
};
