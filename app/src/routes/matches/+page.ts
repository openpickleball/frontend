import { requireSession } from '#lib/features/auth/index.js';
import { pageFromSearch } from '#lib/features/matches/index.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	await requireSession(url);
	return { page: pageFromSearch(url.searchParams) };
};
