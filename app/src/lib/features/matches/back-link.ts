import { filterFromSearch, matchesQuery } from './filter.js';
import { pageFromSearch } from './format.js';

/**
 * Where a back link goes. `href` is always a real address, so the link works with a middle
 * click, a new tab or the keyboard. `back` is true when that address is the history entry just
 * before this one, so a plain click can go back in history instead, and the browser brings the
 * scroll position back.
 */
export type BackTarget = { href: string; label: string; back: boolean };

/** The navigation that opened a page, as `afterNavigate` gives it. */
export type Arrival = {
	type: string;
	from: {
		route: { id: string | null };
		url: URL;
		params: Record<string, string> | null;
	} | null;
};

/** The resolved addresses of Home and Matches, so this file needs no `$app` import. */
export type BackPaths = { home: string; matches: string };

// Navigations that add a history entry after the page they came from. `popstate` is back or
// forward, so the page it came from may be after this one in history. `enter` has no page before.
const PUSHED = new Set(['link', 'goto', 'form']);

/**
 * Where a match page's back link goes.
 *
 * - From Home: "Home".
 * - From Matches: "Matches", with its filter and page.
 * - From another match, or from the correction page after a correction: where that match's back
 *   link went (`remembered`), as a plain link. Going back in history would open the old match or
 *   the correction form again.
 * - Anything else, such as a shared link, the record page or back or forward from another page:
 *   "Matches".
 */
export function matchBackTarget(
	arrival: Arrival,
	paths: BackPaths,
	remembered: (code: string) => BackTarget | undefined
): BackTarget {
	const fallback: BackTarget = { href: paths.matches, label: 'Matches', back: false };
	const { from } = arrival;
	if (!from) return fallback;
	const back = PUSHED.has(arrival.type);
	switch (from.route.id) {
		case '/':
			return { href: paths.home, label: 'Home', back };
		case '/matches': {
			const search = from.url.searchParams;
			const query = matchesQuery(filterFromSearch(search), pageFromSearch(search));
			return { href: `${paths.matches}${query}`, label: 'Matches', back };
		}
		case '/matches/[code]':
		case '/matches/[code]/correct': {
			const earlier = from.params?.code ? remembered(from.params.code) : undefined;
			return earlier ? { ...earlier, back: false } : fallback;
		}
		default:
			return fallback;
	}
}

/**
 * Whether the correction page for `code` was opened from that match's page, so its back link
 * can go back in history.
 */
export function cameFromMatch(arrival: Arrival, code: string): boolean {
	return (
		PUSHED.has(arrival.type) &&
		arrival.from?.route.id === '/matches/[code]' &&
		arrival.from.params?.code === code
	);
}

/** A click that the browser would open in the same tab: the main button, with no modifier key. */
export function isPlainClick(event: MouseEvent): boolean {
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey
	);
}
