/**
 * Defect found by the e2e: a 403 on create reads the memberships again, which replaced
 * `session.organizers`. The dialog rebuilt its form from the new list, so the refusal and
 * everything typed vanished while the dialog stayed open.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import { session, type OrganizerMembership } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import { CREATE_FORBIDDEN } from '../copy.js';
import EventDialog from './event-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	createOrganizerEvent: vi.fn(),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

const LARKSPUR: OrganizerMembership = {
	organizer: 'G-K7MQ-2RD4',
	name: 'Larkspur Paddle League',
	role: 'match_manager',
	verified: true,
	verification_requested: false
};

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'organizer@example.com' });
	session.organizers = [LARKSPUR];
	session.mfaEnrolled = false;
});
afterEach(() => session.reset());

it('keeps the refusal and the typed name when the memberships are read again', async () => {
	mocked.createOrganizerEvent.mockImplementation(async () => {
		// The service reads the memberships again before it throws the 403.
		session.organizers = [{ ...LARKSPUR }];
		throw new AppError({
			kind: 'forbidden',
			status: 403,
			code: 'forbidden',
			message: 'x',
			fields: {}
		});
	});
	await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
	const dialog = page.getByRole('dialog', { name: 'New Event' });
	await dialog.getByLabelText('Name').fill('Made-up Spring Open');
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('league');
	await dialog.getByLabelText('Start date').fill('2027-03-06');
	await dialog.getByLabelText('End date').fill('2027-03-07');
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await expect.element(dialog.getByText(CREATE_FORBIDDEN)).toBeVisible();
	await expect.element(dialog.getByLabelText('Name')).toHaveValue('Made-up Spring Open');
});
