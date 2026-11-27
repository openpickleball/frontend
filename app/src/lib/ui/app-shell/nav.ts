export type NavIconName = 'home' | 'record' | 'matches' | 'ratings' | 'events' | 'profile';

export interface NavItem {
	icon: NavIconName;
	/** The label in the bottom tab bar. */
	label: string;
	/** The label in the side nav, where there is room for more words. */
	sideLabel: string;
	href: '/' | '/record' | '/matches' | '/ratings' | '/organizer' | '/profile';
}

export const NAV_ITEMS: readonly NavItem[] = [
	{ icon: 'home', label: 'Home', sideLabel: 'Home', href: '/' },
	{ icon: 'record', label: 'Record', sideLabel: 'Record a match', href: '/record' },
	{ icon: 'matches', label: 'Matches', sideLabel: 'Matches', href: '/matches' },
	{ icon: 'ratings', label: 'Ratings', sideLabel: 'Ratings', href: '/ratings' },
	{ icon: 'profile', label: 'Profile', sideLabel: 'Profile', href: '/profile' }
];

/** The organizer area. Only an organizer member sees it (display only: the backend decides). */
export const ORGANIZER_ITEM: NavItem = {
	icon: 'events',
	label: 'Events',
	sideLabel: 'Events',
	href: '/organizer'
};

/** The nav entries: `NAV_ITEMS`, with Events before Profile for an organizer member. */
export function navItems(organizer: boolean): readonly NavItem[] {
	if (!organizer) return NAV_ITEMS;
	const profile = NAV_ITEMS.findIndex((item) => item.href === '/profile');
	return [...NAV_ITEMS.slice(0, profile), ORGANIZER_ITEM, ...NAV_ITEMS.slice(profile)];
}

/** True when `pathname` is the item's page or a page under it. Home matches only `/`. */
export function isCurrent(item: NavItem, pathname: string): boolean {
	if (item.href === '/') return pathname === '/';
	return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The Home link's name while matches need the player, such as "Home, 2 need you". The link
 * shows its label to the eye and this to screen readers, in place of the label. An `aria-label`
 * would do the same, but then the badge's digits count as visible text that the name must
 * contain. Null for any other item, or when nothing needs the player.
 */
export function needsYouName(item: NavItem, label: string, count: number): string | null {
	if (item.href !== '/' || count <= 0) return null;
	return count === 1 ? `${label}, 1 needs you` : `${label}, ${count} need you`;
}
