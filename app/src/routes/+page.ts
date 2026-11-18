import { requireSession } from '#lib/features/auth/index.js';
import type { PageLoad } from './$types';

// Signed-in players only. Redirects to sign in, and back here afterwards.
export const load: PageLoad = async ({ url }) => {
	await requireSession(url);
};
