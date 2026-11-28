import type { PageFetcher } from './list-view.svelte.js';
import { needsYou } from './needs-you.svelte.js';
import { listMatches } from './services.js';

/**
 * The filters on Matches, in the order the pills show them. Each one shows a whole list, not
 * just what one page of the history holds.
 *
 * - `all` is every match the player is in, newest first.
 * - `needs-you` is the app's `needsYou` list: the matches to confirm and the held matches the
 *   player's side has not vouched for, oldest first. It is the same list as Home's "Needs you"
 *   and the nav badge. The backend has no such list, so the app reads the awaiting-confirmation
 *   and holds lists in full and pages through the merged list here.
 *
 * Disputed and On hold were filters too, until frontend#333: a player can't act on those from a
 * list, and every match is in All with its tags. Their old links (`?show=disputed`,
 * `?show=on-hold`) now land on All. A filter for every state waits on a backend list of each
 * (openpickleball/backend#338, frontend#335).
 */
export const MATCH_FILTERS = [
	{ value: 'all', label: 'All' },
	{ value: 'needs-you', label: 'Needs you' }
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
 * The query string for a filter and page of Matches, such as `?show=needs-you&page=2`. The
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
		case 'all':
			return (player, offset, options) => listMatches(player, offset, options);
	}
}
