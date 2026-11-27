import { error } from '@sveltejs/kit';
import { organizerMemberships } from '#lib/features/auth/index.js';
import { pageFromSearch } from '#lib/features/organizer/index.js';
import type { PageLoad } from './$types';

// Members only. The load waits for the memberships, so nothing decides before they are known.
// Anyone else gets the same not found page as an unknown address, and the page never asks for
// the Event operations. Display only: the backend refuses them to non-members anyway.
export const load: PageLoad = async ({ url }) => {
	const memberships = await organizerMemberships(url);
	if (memberships.length === 0) error(404, 'Not Found');
	return { page: pageFromSearch(url.searchParams) };
};
