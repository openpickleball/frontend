import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { matchCache } from '../cache.svelte.js';
import { rowLabel } from '../format.js';
import { TAMSIN, viewerMatch } from '../testing.js';
import MatchRow from './match-row.svelte';

beforeEach(() => matchCache.reset());
afterEach(() => matchCache.reset());

describe('MatchRow', () => {
	it('shows a hidden chevron that marks the row as a link', async () => {
		const match = viewerMatch({ b: true });
		await render(MatchRow, { match, you: TAMSIN });

		const row = page.getByTestId('match-row').element();
		const icons = row.querySelectorAll('svg');
		expect(icons).toHaveLength(1);
		expect(icons[0].getAttribute('aria-hidden')).toBe('true');
	});

	it('keeps the sentence as the link name', async () => {
		const match = viewerMatch({ b: true });
		await render(MatchRow, { match, you: TAMSIN });

		await expect
			.element(
				page.getByRole('link', { name: new RegExp(`^${RegExp.escape(rowLabel(match, TAMSIN))}`) })
			)
			.toBeVisible();
	});
});
