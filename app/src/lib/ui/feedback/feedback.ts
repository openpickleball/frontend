/**
 * The feedback form, hosted by Tally. The app shows Tally's iframe embed in a dialog and never
 * loads Tally's `embed.js`. `src/csp.ts` allows this origin in `frame-src`.
 */

/** The Tally form id. */
export const FEEDBACK_FORM_ID = 'EqWB5B';

/**
 * The iframe address. `hideTitle=1` matches the site's Tally popup. It carries no personal data:
 * no name, email, player code or match code.
 */
export const FEEDBACK_EMBED_URL = `https://tally.so/embed/${FEEDBACK_FORM_ID}?hideTitle=1`;

/** The same form on its own page, for the new-tab link when the embed can't load. */
export const FEEDBACK_PAGE_URL = `https://tally.so/r/${FEEDBACK_FORM_ID}`;

/** The origin the embed's messages come from. */
export const FEEDBACK_ORIGIN = new URL(FEEDBACK_EMBED_URL).origin;

/**
 * The iframe sandbox: scripts, the form and its own origin (Tally sends the answers with a
 * script), and popups for any link in the form. No top-level navigation.
 */
export const FEEDBACK_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-popups';

/** How long to wait for the form before offering the new-tab link instead. */
export const FEEDBACK_TIMEOUT_MS = 10_000;

/**
 * Whether a message from the embed says the form has loaded. Tally posts
 * `{"event":"Tally.FormLoaded",...}` to the parent page as a JSON string, the message its own
 * `embed.js` listens for.
 */
export function isFormLoaded(data: unknown): boolean {
	if (typeof data !== 'string') return false;
	try {
		const parsed: unknown = JSON.parse(data);
		return (
			typeof parsed === 'object' &&
			parsed !== null &&
			(parsed as { event?: unknown }).event === 'Tally.FormLoaded'
		);
	} catch {
		return false;
	}
}
