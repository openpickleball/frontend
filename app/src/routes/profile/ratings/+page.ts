import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { ROUTES } from '#lib/domain/index.js';
import type { PageLoad } from './$types';

// Rating history was here before it became the Ratings tab. Old links land there.
export const load: PageLoad = () => {
	redirect(308, resolve(ROUTES.ratings));
};
