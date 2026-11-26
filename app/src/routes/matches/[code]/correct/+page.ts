import { requireSession } from '#lib/features/auth/index.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	await requireSession(url);
};
