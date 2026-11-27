import type { PageFetcher } from './list-view.svelte.js';
import { listAwaitingConfirmation, listMatches, listMyDisputes, listMyHolds } from './services.js';

/**
 * The filters on Matches, in the order the menu lists them. Each one is a list the backend
 * serves with paging, so every filter shows the whole list, not just what one page of the
 * history holds.
 *
 * - `needs-you` is `GET me/matches/awaiting-confirmation`: pending matches the player played in
 *   that no one on their team has confirmed. Held matches the player can still vouch for are not
 *   in it. They have their own filter, and the two lists can't be paged as one.
 * - `disputed` is `GET me/matches/disputes`, and `on-hold` is `GET me/matches/holds`.
 *
 * There is no "Waiting for the other team" filter. The backend has no list of matches the
 * player's team confirmed and the other team has not, and working it out from one page of the
 * history would miss older matches. Add it once the backend serves that list.
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

/** How the filter reads in the menu and the page title. */
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
			return (_player, offset, options) => listAwaitingConfirmation(offset, options);
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
