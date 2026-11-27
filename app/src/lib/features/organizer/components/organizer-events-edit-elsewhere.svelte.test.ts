/**
 * Defect F8: an edited Event that is not on the current page was added to it as a new row.
 * An edit only replaces a row that is there.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn(),
	updateOrganizerEvent: vi.fn(),
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
	session.organizers = [];
	session.mfaEnrolled = true;
});
afterEach(() => session.reset());

it('adds nothing when the edited Event is not on the page shown', async () => {
	mocked.listOrganizerEvents
		.mockResolvedValueOnce({ items: [event(2)], count: 21 })
		.mockResolvedValueOnce({ items: [event(1)], count: 21 });
	mocked.updateOrganizerEvent.mockResolvedValue({ ...event(2), kind: 'tournament' });
	const screen = await render(OrganizerEvents, { page: 1 });
	await page.getByRole('button', { name: 'Edit Made-up Event 2' }).click();
	// The page under the dialog moves on (as after a reload) before the save answers.
	await screen.rerender({ page: 2 });
	const dialog = page.getByRole('dialog', { name: 'Edit Event' });
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect.element(dialog).not.toBeInTheDocument();
	const list = page.getByRole('list', { name: 'Your Events' });
	await expect.element(list.getByText('Made-up Event 1', { exact: true })).toBeVisible();
	await expect.element(list.getByText('Made-up Event 2', { exact: true })).not.toBeInTheDocument();
});

it('replaces an edited row in place, with no new read', async () => {
	mocked.listOrganizerEvents.mockResolvedValue({ items: [event(2), event(1)], count: 2 });
	mocked.updateOrganizerEvent.mockResolvedValue({ ...event(2), kind: 'tournament' });
	await render(OrganizerEvents, { page: 1 });
	await page.getByRole('button', { name: 'Edit Made-up Event 2' }).click();
	const dialog = page.getByRole('dialog', { name: 'Edit Event' });
	await dialog.getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect.element(page.getByText('Tournament', { exact: true })).toBeVisible();
	expect(page.getByRole('listitem').elements()).toHaveLength(2);
	expect(mocked.listOrganizerEvents).toHaveBeenCalledTimes(1);
});
