export type NavIconName = 'home' | 'record' | 'matches' | 'profile';

export interface NavItem {
	icon: NavIconName;
	/** The label in the bottom tab bar. */
	label: string;
	/** The label in the side nav, where there is room for more words. */
	sideLabel: string;
	href: '/' | '/record' | '/matches' | '/profile';
}

export const NAV_ITEMS: readonly NavItem[] = [
	{ icon: 'home', label: 'Home', sideLabel: 'Home', href: '/' },
	{ icon: 'record', label: 'Record', sideLabel: 'Record a match', href: '/record' },
	{ icon: 'matches', label: 'Matches', sideLabel: 'Matches', href: '/matches' },
	{ icon: 'profile', label: 'Profile', sideLabel: 'Profile', href: '/profile' }
];

/** True when `pathname` is the item's page or a page under it. Home matches only `/`. */
export function isCurrent(item: NavItem, pathname: string): boolean {
	if (item.href === '/') return pathname === '/';
	return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
