/**
 * Defect F15: after a create the page reads the page it is on again, so a new Event that belongs
 * on page 1 never shows from page 2, and nothing confirmed the create.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { toast } from 'svelte-sonner';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('svelte-sonner', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte-sonner')>()),
	toast: vi.fn()
}));
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn(),
	createOrganizerEvent: vi.fn(),
	updateOrganizerEvent: vi.fn(),
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

it('confirms a create made from page 2 with a toast', async () => {
	mocked.listOrganizerEvents.mockResolvedValue({ items: [], count: 25 });
	mocked.createOrganizerEvent.mockResolvedValue(created);
	await render(OrganizerEvents, { page: 2 });
	await page.getByRole('button', { name: 'New Event' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Event' });
	await dialog.getByLabelText('Name').fill(created.name);
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('league');
	await dialog.getByLabelText('Start date').fill(created.startDate);
	await dialog.getByLabelText('End date').fill(created.endDate);
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await vi.waitFor(() => expect(vi.mocked(toast)).toHaveBeenCalled());
	expect(vi.mocked(toast).mock.calls[0][0]).toBe('Event created');
	expect(mocked.listOrganizerEvents).toHaveBeenLastCalledWith(20);
});
