import { describe, expect, it } from 'vitest';
import {
	FEEDBACK_EMBED_URL,
	FEEDBACK_ORIGIN,
	FEEDBACK_PAGE_URL,
	FEEDBACK_SANDBOX,
	isFormLoaded
} from './feedback';

describe('the feedback form addresses', () => {
	it('embeds form EqWB5B with its title hidden, like the site popup, and nothing else', () => {
		const url = new URL(FEEDBACK_EMBED_URL);
		expect(url.origin).toBe('https://tally.so');
		expect(url.pathname).toBe('/embed/EqWB5B');
		// No name, email, player code or match code: only the display option.
		expect([...url.searchParams]).toEqual([['hideTitle', '1']]);
	});

	it('opens the same form on its own page for the new-tab link', () => {
		expect(FEEDBACK_PAGE_URL).toBe('https://tally.so/r/EqWB5B');
		expect(FEEDBACK_ORIGIN).toBe('https://tally.so');
	});

	it('sandboxes the iframe without top-level navigation', () => {
		expect(FEEDBACK_SANDBOX.split(' ').sort()).toEqual([
			'allow-forms',
			'allow-popups',
			'allow-same-origin',
			'allow-scripts'
		]);
		expect(FEEDBACK_SANDBOX).not.toContain('top-navigation');
	});
});

describe('isFormLoaded', () => {
	it("reads Tally's FormLoaded message", () => {
		expect(
			isFormLoaded(JSON.stringify({ event: 'Tally.FormLoaded', payload: { formId: 'EqWB5B' } }))
		).toBe(true);
	});

	it('ignores every other message', () => {
		expect(isFormLoaded('[iFrameResizerChild]Ready')).toBe(false);
		expect(isFormLoaded(JSON.stringify({ event: 'Tally.FormPageView' }))).toBe(false);
		expect(isFormLoaded({ event: 'Tally.FormLoaded' })).toBe(false);
		expect(isFormLoaded('null')).toBe(false);
	});
});
