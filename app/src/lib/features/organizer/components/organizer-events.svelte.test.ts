import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session, type OrganizerMembership } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import { DELETE_PROTECTED, LIST_EMPTY_TITLE, LIST_ERROR, waitingForVerification } from '../copy.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn(),
	deleteOrganizerEvent: vi.fn(),
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
const THISTLE: OrganizerMembership = {
	...LARKSPUR,
	organizer: 'G-WN3P-8TQX',
	name: 'Thistle Bay Social',
	verified: false
};

function event(overrides: Partial<OrganizerEvent> = {}): OrganizerEvent {
	return {
		code: 'E-SEED-0001',
		name: 'Larkspur Winter League',
		kind: 'league',
		organizer: LARKSPUR.organizer,
		club: null,
		startDate: '2026-11-02',
		endDate: '2026-12-14',
		...overrides
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.organizers = [LARKSPUR];
	session.mfaEnrolled = true;
});
afterEach(() => session.reset());

const list = () => page.getByRole('list', { name: 'Your Events' });

describe('OrganizerEvents list', () => {
	it('shows each Event with its kind, organizer and dates', async () => {
		mocked.listOrganizerEvents.mockResolvedValue({
			items: [
				event(),
				event({
					code: 'E-SEED-0002',
					name: 'Made-up Old Night',
					kind: 'rec_verified',
					organizer: 'G-GONE-0000',
					startDate: '2026-09-03',
					endDate: '2026-09-03'
				})
			],
			count: 2
		});
		await render(OrganizerEvents, { page: 1 });
		const rows = list().getByRole('listitem');
		const first = rows.first();
		await expect.element(first.getByText('Larkspur Winter League', { exact: true })).toBeVisible();
		await expect.element(first.getByText('League', { exact: true })).toBeVisible();
		await expect
			.element(first.getByText('Larkspur Paddle League · 2 Nov 2026 to 14 Dec 2026'))
			.toBeVisible();
		await expect.element(rows.nth(1).getByText('Verified rec play')).toBeVisible();
		// An organizer the memberships no longer list shows by its code.
		await expect.element(rows.nth(1).getByText('G-GONE-0000 · 3 Sep 2026')).toBeVisible();
		expect(mocked.listOrganizerEvents).toHaveBeenCalledWith(0);
	});

	it('reads the page it is given, 20 at a time, with Newer and Older', async () => {
		mocked.listOrganizerEvents.mockResolvedValue({ items: [event()], count: 41 });
		await render(OrganizerEvents, { page: 2 });
		await expect.element(page.getByTestId('range')).toHaveTextContent('21–21 of 41');
		expect(mocked.listOrganizerEvents).toHaveBeenCalledWith(20);
		await expect
			.element(page.getByRole('link', { name: 'Newer' }))
			.toHaveAttribute('href', '/organizer?page=1');
		await expect
			.element(page.getByRole('link', { name: 'Older' }))
			.toHaveAttribute('href', '/organizer?page=3');
	});

	it('shows an empty state', async () => {
		mocked.listOrganizerEvents.mockResolvedValue({ items: [], count: 0 });
		await render(OrganizerEvents, { page: 1 });
		await expect.element(page.getByRole('heading', { name: LIST_EMPTY_TITLE })).toBeVisible();
	});

	it('shows a loading state while the list loads', async () => {
		mocked.listOrganizerEvents.mockReturnValue(new Promise(() => {}));
		await render(OrganizerEvents, { page: 1 });
		await expect.element(page.getByRole('status')).toHaveTextContent('Loading your Events…');
	});

	it('shows an error with Try again, which reads the list again', async () => {
		mocked.listOrganizerEvents.mockRejectedValueOnce(
			new AppError({ kind: 'server', status: 500, code: 'x', message: 'x', fields: {} })
		);
		mocked.listOrganizerEvents.mockResolvedValueOnce({ items: [event()], count: 1 });
		await render(OrganizerEvents, { page: 1 });
		await expect.element(page.getByText(LIST_ERROR)).toBeVisible();
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect.element(list().getByText('Larkspur Winter League', { exact: true })).toBeVisible();
	});
});

describe('OrganizerEvents callouts', () => {
	it('says which organizer waits for verification, and still shows the list', async () => {
		session.organizers = [LARKSPUR, THISTLE];
		mocked.listOrganizerEvents.mockResolvedValue({ items: [event()], count: 1 });
		await render(OrganizerEvents, { page: 1 });
		await expect
			.element(page.getByText(waitingForVerification('Thistle Bay Social')))
			.toBeVisible();
		await expect.element(list()).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'New Event' })).toBeVisible();
	});

	it('shows the two-factor prompt and its link when two-factor is off', async () => {
		session.mfaEnrolled = false;
		mocked.listOrganizerEvents.mockResolvedValue({ items: [], count: 0 });
		await render(OrganizerEvents, { page: 1 });
		await expect
			.element(page.getByText('Organizer actions need two-factor authentication.'))
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Set up two-factor' }))
			.toHaveAttribute('href', '/profile/two-factor');
	});

	it('has no New Event button when no organizer is verified', async () => {
		session.organizers = [THISTLE];
		mocked.listOrganizerEvents.mockResolvedValue({ items: [], count: 0 });
		await render(OrganizerEvents, { page: 1 });
		await expect.element(page.getByRole('heading', { name: LIST_EMPTY_TITLE })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'New Event' })).not.toBeInTheDocument();
	});
});

describe('OrganizerEvents delete', () => {
	it('asks first, naming the Event, then removes the row', async () => {
		mocked.listOrganizerEvents.mockResolvedValue({ items: [event()], count: 1 });
		mocked.deleteOrganizerEvent.mockResolvedValue();
		await render(OrganizerEvents, { page: 1 });
		await page.getByRole('button', { name: 'Delete Larkspur Winter League' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Delete Larkspur Winter League?' });
		await confirm.getByRole('button', { name: 'Delete' }).click();
		await expect.element(page.getByRole('heading', { name: LIST_EMPTY_TITLE })).toBeVisible();
		expect(mocked.deleteOrganizerEvent).toHaveBeenCalledWith('E-SEED-0001');
	});

	it('explains a 409 in the dialog and keeps the row', async () => {
		mocked.listOrganizerEvents.mockResolvedValue({ items: [event()], count: 1 });
		mocked.deleteOrganizerEvent.mockRejectedValue(
			new AppError({ kind: 'conflict', status: 409, code: 'conflict', message: 'x', fields: {} })
		);
		await render(OrganizerEvents, { page: 1 });
		await page.getByRole('button', { name: 'Delete Larkspur Winter League' }).click();
		const confirm = page.getByRole('alertdialog');
		await confirm.getByRole('button', { name: 'Delete' }).click();
		await expect.element(confirm.getByText(DELETE_PROTECTED)).toBeVisible();
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(list().getByRole('listitem')).toBeVisible();
	});
});
