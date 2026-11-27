import type { PageFetcher } from './list-view.svelte.js';
import { needsYou } from './needs-you.svelte.js';
import { listMatches, listMyDisputes, listMyHolds } from './services.js';

/**
 * The filters on Matches, in the order the pills show them. Each one shows a whole list, not
 * just what one page of the history holds.
 *
 * - `needs-you` is the app's `needsYou` list: the matches to confirm and the held matches the
 *   player's side has not vouched for, oldest first. It is the same list as Home's "Needs you"
 *   and the nav badge. The backend has no such list, so the app reads the awaiting-confirmation
 *   and holds lists in full and pages through the merged list here.
 * - `disputed` is `GET me/matches/disputes`, and `on-hold` is `GET me/matches/holds`, paged by
 *   the backend. On hold lists every hold, also the ones under Needs you.
 *
 * There is no "Waiting for the other team" filter. The backend has no list of matches the
 * player's team confirmed and the other team has not, and working it out from one page of the
 * history would miss older matches. Add it once the backend serves that list
 * (openpickleball/backend#338).
 */
export const MATCH_FILTERS = [
	{ value: 'all', label: 'All' },
	{ value: 'needs-you', label: 'Needs you' },
	{ value: 'disputed', label: 'Disputed' },
	{ value: 'on-hold', label: 'On hold' }
] as const;

export type MatchFilter = (typeof MATCH_FILTERS)[number]['value'];

/** The filter in `?show=`. A missing or unknown value is `all`. */
export function filterFromSearch(search: URLSearchParams): MatchFilter {
	const raw = search.get('show');
	return MATCH_FILTERS.find((filter) => filter.value === raw)?.value ?? 'all';
}

/** How the filter reads on its pill and in the page title. */
export function filterLabel(filter: MatchFilter): string {
	return MATCH_FILTERS.find((option) => option.value === filter)!.label;
}

/**
 * The query string for a filter and page of Matches, such as `?show=disputed&page=2`. The
 * defaults (`all`, page 1) are left out, so the plain address stays `/matches`.
 */
export function matchesQuery(filter: MatchFilter, page = 1): string {
	const search = new URLSearchParams();
	if (filter !== 'all') search.set('show', filter);
	if (page > 1) search.set('page', String(page));
	const query = search.toString();
	return query ? `?${query}` : '';
}

/** Fetches one page of the list a filter shows. */
export function fetcherFor(filter: MatchFilter): PageFetcher {
	switch (filter) {
		case 'needs-you':
			// The app-wide list, on the app-wide cache, so the count here is the badge's count.
			return async (_player, offset, { limit }) => {
				await needsYou.load();
				if (needsYou.status === 'error') throw needsYou.error;
				const all = needsYou.matches;
				return { items: all.slice(offset, offset + limit), count: all.length };
			};
		case 'disputed':
			return (_player, offset, options) => listMyDisputes(offset, options);
		case 'on-hold':
			return async (_player, offset, options) => {
				const page = await listMyHolds(offset, options);
				return { items: page.items.map((hold) => hold.match), count: page.count };
			};
		case 'all':
			return (player, offset, options) => listMatches(player, offset, options);
	}
}
