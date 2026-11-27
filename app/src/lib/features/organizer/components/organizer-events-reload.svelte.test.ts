/**
 * Defect F5: create and delete changed the rows on the page by hand. A delete on page 1 skipped
 * the Event that moved up from page 2, a create on a full page showed 21 rows, and a create on
 * page 2 was sorted into page 2. After a create or a delete the page is read again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn(),
	createOrganizerEvent: vi.fn(),
	deleteOrganizerEvent: vi.fn(),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

const event = (n: number): OrganizerEvent => ({
	code: `E-SEED-${String(n).padStart(4, '0')}`,
	name: `Made-up Event ${n}`,
	kind: 'league',
	organizer: 'G-K7MQ-2RD4',
	club: null,
	startDate: `2026-01-${String(n).padStart(2, '0')}`,
	endDate: `2026-01-${String(n).padStart(2, '0')}`
});

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

const list = () => page.getByRole('list', { name: 'Your Events' });

describe('OrganizerEvents after a change', () => {
	it('reads the page again after a delete, so the next Event moves up', async () => {
		mocked.listOrganizerEvents
			.mockResolvedValueOnce({ items: [event(3), event(2)], count: 3 })
			.mockResolvedValueOnce({ items: [event(2), event(1)], count: 2 });
		mocked.deleteOrganizerEvent.mockResolvedValue();
		await render(OrganizerEvents, { page: 1 });
		await page.getByRole('button', { name: 'Delete Made-up Event 3' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect.element(list().getByText('Made-up Event 1', { exact: true })).toBeVisible();
		expect(mocked.listOrganizerEvents).toHaveBeenLastCalledWith(0);
	});

	it('reads the page it is on again after a create', async () => {
		mocked.listOrganizerEvents
			.mockResolvedValueOnce({ items: [event(2)], count: 21 })
			.mockResolvedValueOnce({ items: [event(1)], count: 22 });
		mocked.createOrganizerEvent.mockResolvedValue(event(30));
		await render(OrganizerEvents, { page: 2 });
		await page.getByRole('button', { name: 'New Event' }).click();
		const dialog = page.getByRole('dialog', { name: 'New Event' });
		await dialog.getByLabelText('Name').fill('Made-up Event 30');
		await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('league');
		await dialog.getByLabelText('Start date').fill('2026-01-30');
		await dialog.getByLabelText('End date').fill('2026-01-30');
		await dialog.getByRole('button', { name: 'Create Event' }).click();
		await expect.element(list().getByText('Made-up Event 1', { exact: true })).toBeVisible();
		expect(mocked.listOrganizerEvents).toHaveBeenLastCalledWith(20);
		await expect
			.element(list().getByText('Made-up Event 30', { exact: true }))
			.not.toBeInTheDocument();
		await expect.element(page.getByTestId('range')).toHaveTextContent('21–21 of 22');
	});
});
