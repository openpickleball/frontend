/**
 * Defect F9: a 422 on a field the dialog shows as text (the only organizer, or the club of an
 * existing Event) had nowhere to show, so the dialog said nothing.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import EventDialog from './event-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	createOrganizerEvent: vi.fn(),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.mfaEnrolled = true;
	session.organizers = [
		{
			organizer: 'G-K7MQ-2RD4',
			name: 'Larkspur Paddle League',
			role: 'match_manager',
			verified: true,
			verification_requested: false
		}
	];
});
afterEach(() => session.reset());

it('shows a refusal on the organizer shown as text as a message in the dialog', async () => {
	mocked.createOrganizerEvent.mockRejectedValue(
		new AppError({
			kind: 'validation',
			status: 422,
			code: 'validation_error',
			message: 'Please check the highlighted fields.',
			fields: { organizer: ['Choose an existing organizer.'] }
		})
	);
	await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
	const dialog = page.getByRole('dialog', { name: 'New Event' });
	await dialog.getByLabelText('Name').fill('Made-up Spring Open');
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('league');
	await dialog.getByLabelText('Start date').fill('2027-03-06');
	await dialog.getByLabelText('End date').fill('2027-03-07');
	await dialog.getByRole('button', { name: 'Create Event' }).click();
	await expect.element(dialog.getByText('Choose an existing organizer.')).toBeVisible();
});
