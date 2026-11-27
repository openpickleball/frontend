import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import * as services from '../services.js';
import { CLUB_CODE_HINT, NO_CLUB } from '../copy.js';
import ClubField from './club-field.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

const GRANT = { club: 'C-JNPR-4CRT', name: 'Juniper Court Club', city: 'Brindlequay', region: 'X' };

beforeEach(() => vi.resetAllMocks());

describe('ClubField', () => {
	it('offers the granted clubs to an admin, after No club', async () => {
		mocked.listClubGrants.mockResolvedValue([GRANT]);
		const onchange = vi.fn();
		await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: true, onchange });
		const select = page.getByRole('combobox', { name: 'Club' });
		await expect.element(select).toBeVisible();
		const options = select.element().querySelectorAll('option');
		expect([...options].map((o) => o.textContent?.trim())).toEqual([
			NO_CLUB,
			'Juniper Court Club (Brindlequay)'
		]);
		expect(mocked.listClubGrants).toHaveBeenCalledWith('G-K7MQ-2RD4');
		await userEvent.selectOptions(select, GRANT.club);
		expect(onchange).toHaveBeenLastCalledWith(GRANT.club);
	});

	it('asks a match manager for a club code, and reads no grants', async () => {
		await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: false, onchange: vi.fn() });
		await expect.element(page.getByRole('textbox', { name: 'Club code' })).toBeVisible();
		await expect.element(page.getByText(CLUB_CODE_HINT)).toBeVisible();
		expect(mocked.listClubGrants).not.toHaveBeenCalled();
	});

	it('falls back to the code input when the grants read fails', async () => {
		mocked.listClubGrants.mockRejectedValue(
			new AppError({
				kind: 'forbidden',
				status: 403,
				code: 'mfa_required',
				message: 'x',
				fields: {}
			})
		);
		await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: true, onchange: vi.fn() });
		await expect.element(page.getByRole('textbox', { name: 'Club code' })).toBeVisible();
	});

	it("shows the backend's message on the field", async () => {
		await render(ClubField, {
			organizer: 'G-K7MQ-2RD4',
			admin: false,
			onchange: vi.fn(),
			error: 'Choose an existing club.'
		});
		await expect.element(page.getByText('Choose an existing club.')).toBeVisible();
		await expect
			.element(page.getByRole('textbox', { name: 'Club code' }))
			.toHaveAttribute('aria-invalid', 'true');
	});
});
