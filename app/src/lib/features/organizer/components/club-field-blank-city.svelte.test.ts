/** Defect F11: a granted club with a blank city read "Name ()" in the picker. */
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

it('names a club with no city by its name alone', async () => {
	vi.mocked(services).listClubGrants.mockResolvedValue([
		{ club: 'C-JNPR-4CRT', name: 'Juniper Court Club', city: '', region: '' }
	]);
	await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: true });
	const select = page.getByRole('combobox', { name: 'Club' });
	await expect
		.element(select.getByRole('option', { name: 'Juniper Court Club' }))
		.toBeInTheDocument();
	const labels = [...select.element().querySelectorAll('option')].map((o) => o.textContent?.trim());
	expect(labels).toEqual(['No club', 'Juniper Court Club']);
});
