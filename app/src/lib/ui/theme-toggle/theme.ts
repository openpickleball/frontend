// Theme logic shared by the toggle. It matches site/public/index.html: the toggle flips whichever
// theme is showing, stores the choice in localStorage under "theme", and updates the theme-color
// metas. With no stored choice, the system setting decides. The inline script in app.html applies
// a stored choice before first paint.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/** The browser chrome color for each theme: the page background. */
export const THEME_COLORS: Record<Theme, string> = {
	light: '#f7f3e8',
	dark: '#000000'
};

/** The theme that is showing: the stored choice on <html data-theme>, else the system setting. */
export function currentTheme(
	root: { dataset: { theme?: string } },
	systemPrefersLight: boolean
): Theme {
	const chosen = root.dataset.theme;
	if (chosen === 'light' || chosen === 'dark') return chosen;
	return systemPrefersLight ? 'light' : 'dark';
}

export function nextTheme(theme: Theme): Theme {
	return theme === 'light' ? 'dark' : 'light';
}

/** The label for the button while `theme` is showing: it names the theme a click switches to. */
export function toggleLabel(theme: Theme): string {
	return theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

interface ThemeDocument {
	documentElement: { dataset: { theme?: string } };
	querySelectorAll(selectors: string): Iterable<{ content: string }>;
}

/** Sets the theme on <html>, in the theme-color metas and in storage. */
export function applyTheme(
	theme: Theme,
	doc: ThemeDocument,
	storage?: Pick<Storage, 'setItem'>
): void {
	doc.documentElement.dataset.theme = theme;
	for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
		meta.content = THEME_COLORS[theme];
	}
	try {
		storage?.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage can be blocked. The theme still applies for this visit.
	}
}
