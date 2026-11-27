/**
 * Defect F7: the club stayed set when the organizer changed, so a club the new organizer's picker
 * or code input no longer showed was still sent.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import * as services from '../services.js';
import ClubField from './club-field.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listClubGrants: vi.fn()
}));

beforeEach(() => vi.resetAllMocks());

it('clears the club when the organizer changes', async () => {
	const onchange = vi.fn();
	const screen = await render(ClubField, {
		organizer: 'G-K7MQ-2RD4',
		admin: false,
		value: 'C-JNPR-4CRT',
		onchange
	});
	const input = page.getByRole('textbox', { name: 'Club code' });
	await expect.element(input).toHaveValue('C-JNPR-4CRT');
	await screen.rerender({ organizer: 'G-AAAA-BBBB' });
	await expect.element(input).toHaveValue('');
	expect(onchange).toHaveBeenLastCalledWith('');
	expect(vi.mocked(services).listClubGrants).not.toHaveBeenCalled();
});
