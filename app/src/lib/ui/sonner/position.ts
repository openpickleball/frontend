/** From this width the tab bar gives way to the side nav. Same as the `shell` breakpoint. */
export const WIDE_QUERY = '(min-width: 960px)';

// svelte-sonner applies `mobileOffset` only under 600px, so below 960px both offsets must clear
// the tab bar (the bar plus the safe-area inset), or toasts cover it between 600 and 959px.
const ABOVE_TAB_BAR = 'calc(var(--tabbar-height) + 16px + env(safe-area-inset-bottom))';

/** Where toasts go: above the tab bar, centered, below 960px; bottom right from 960px. */
export function toastPlacement(wide: boolean) {
	if (wide) {
		return { position: 'bottom-right', offset: '32px', mobileOffset: '32px' } as const;
	}
	return {
		position: 'bottom-center',
		offset: { bottom: ABOVE_TAB_BAR },
		mobileOffset: { bottom: ABOVE_TAB_BAR }
	} as const;
}
