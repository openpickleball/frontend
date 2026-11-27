/**
 * Defect F14: after a create, the page read the offset of its last good read, which is 0 when the
 * first read failed. Page 1's rows then showed under `?page=3`.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn(),
	createOrganizerEvent: vi.fn(),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

const created: OrganizerEvent = {
	code: 'E-MOCK-0001',
	name: 'Made-up Spring Open',
	kind: 'league',
	organizer: 'G-K7MQ-2RD4',
	club: null,
	startDate: '2027-03-06',
	endDate: '2027-03-06'
};

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.organizers = [
		{
			organizer: 'G-K7MQ-2RD4',
			name: 'Larkspur Paddle League',
			role: 'match_manager',
			verified: true,
			verification_requested: false
		}
	];
	session.mfaEnrolled = true;
});
afterEach(() => session.reset());

it('reads the page from the address after a create, even when no read has worked yet', async () => {
	mocked.listOrganizerEvents
		.mockRejectedValueOnce(
			new AppError({ kind: 'server', status: 500, code: 'x', message: 'x', fields: {} })
		)
		.mockResolvedValue({ items: [], count: 41 });
	mocked.createOrganizerEvent.mockResolvedValue(created);
	await render(OrganizerEvents, { page: 3 });
	await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	await page.getByRole('button', { name: 'New Event' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Event' });
	await dialog.getByLabelText('Name').fill(created.name);
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('league');
	await dialog.getByLabelText('Start date').fill(created.startDate);
	await dialog.getByLabelText('End date').fill(created.endDate);
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await vi.waitFor(() => expect(mocked.listOrganizerEvents).toHaveBeenCalledTimes(2));
	expect(mocked.listOrganizerEvents).toHaveBeenLastCalledWith(40);
});
