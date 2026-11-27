import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session, type OrganizerMembership } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import { CREATE_FORBIDDEN, KIND_NOTE } from '../copy.js';
import EventDialog from './event-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	createOrganizerEvent: vi.fn(),
	updateOrganizerEvent: vi.fn(),
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
const SECOND: OrganizerMembership = {
	...LARKSPUR,
	organizer: 'G-AAAA-BBBB',
	name: 'Made-up Second'
};
const EVENT: OrganizerEvent = {
	code: 'E-SEED-0001',
	name: 'Larkspur Winter League',
	kind: 'league',
	organizer: LARKSPUR.organizer,
	club: 'C-JNPR-4CRT',
	startDate: '2026-11-02',
	endDate: '2026-12-14'
};

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.organizers = [LARKSPUR];
	session.mfaEnrolled = true;
});
afterEach(() => session.reset());

const dialog = () => page.getByRole('dialog', { name: /Event/ });

describe('EventDialog for a new Event', () => {
	it('shows the only verified organizer as text', async () => {
		await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
		await expect.element(dialog().getByText('Larkspur Paddle League')).toBeVisible();
		await expect
			.element(dialog().getByRole('combobox', { name: 'Organizer' }))
			.not.toBeInTheDocument();
		await expect.element(dialog().getByLabelText('Start date')).toHaveAttribute('type', 'date');
	});

	it('offers a choice when two organizers are verified', async () => {
		session.organizers = [LARKSPUR, SECOND];
		await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
		await expect.element(dialog().getByRole('combobox', { name: 'Organizer' })).toBeVisible();
	});

	it('shows the client checks on their fields and sends nothing', async () => {
		await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
		await dialog().getByRole('button', { name: 'Create Event' }).click();
		await expect.element(dialog().getByText("Enter the Event's name.")).toBeVisible();
		await expect.element(dialog().getByLabelText('Name')).toHaveFocus();
		expect(mocked.createOrganizerEvent).not.toHaveBeenCalled();
	});

	it('creates the Event and hands it back', async () => {
		const onsaved = vi.fn();
		mocked.createOrganizerEvent.mockResolvedValue({ ...EVENT, code: 'E-MOCK-0001' });
		await render(EventDialog, { open: true, event: null, onsaved, ongone: vi.fn() });
		await dialog().getByLabelText('Name').fill('Made-up Spring Open');
		await dialog().getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
		await dialog().getByLabelText('Start date').fill('2027-03-06');
		await dialog().getByLabelText('End date').fill('2027-03-07');
		await dialog().getByRole('button', { name: 'Create Event' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(mocked.createOrganizerEvent.mock.calls[0][0]).toMatchObject({
			name: 'Made-up Spring Open',
			organizer: LARKSPUR.organizer
		});
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('explains a 403 with a link to two-factor setup when it is off', async () => {
		session.mfaEnrolled = false;
		mocked.createOrganizerEvent.mockRejectedValue(
			new AppError({ kind: 'forbidden', status: 403, code: 'forbidden', message: 'x', fields: {} })
		);
		await render(EventDialog, { open: true, event: null, onsaved: vi.fn(), ongone: vi.fn() });
		await dialog().getByLabelText('Name').fill('Made-up Spring Open');
		await dialog().getByRole('combobox', { name: 'Kind' }).selectOptions('league');
		await dialog().getByLabelText('Start date').fill('2027-03-06');
		await dialog().getByLabelText('End date').fill('2027-03-07');
		await dialog().getByRole('button', { name: 'Create Event' }).click();
		await expect.element(dialog().getByText(CREATE_FORBIDDEN)).toBeVisible();
		await expect
			.element(dialog().getByRole('link', { name: 'Set up two-factor' }))
			.toHaveAttribute('href', '/profile/two-factor');
	});
});

describe('EventDialog for an existing Event', () => {
	it('shows the organizer and club as text, and the note on the kind', async () => {
		await render(EventDialog, { open: true, event: EVENT, onsaved: vi.fn(), ongone: vi.fn() });
		await expect.element(dialog().getByText('Larkspur Paddle League')).toBeVisible();
		await expect.element(dialog().getByText('C-JNPR-4CRT')).toBeVisible();
		await expect.element(dialog().getByText(KIND_NOTE)).toBeVisible();
		await expect.element(dialog().getByLabelText('Name')).toHaveValue(EVENT.name);
		expect(mocked.listClubGrants).not.toHaveBeenCalled();
	});

	it('closes without a request when nothing changed', async () => {
		const onsaved = vi.fn();
		await render(EventDialog, { open: true, event: EVENT, onsaved, ongone: vi.fn() });
		await dialog().getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(mocked.updateOrganizerEvent).not.toHaveBeenCalled();
		expect(onsaved).not.toHaveBeenCalled();
	});

	it('sends only the kind and hands back the changed Event', async () => {
		const onsaved = vi.fn();
		mocked.updateOrganizerEvent.mockResolvedValue({ ...EVENT, kind: 'tournament' });
		await render(EventDialog, { open: true, event: EVENT, onsaved, ongone: vi.fn() });
		await dialog().getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
		await dialog().getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalledWith({ ...EVENT, kind: 'tournament' }));
		expect(mocked.updateOrganizerEvent.mock.calls[0].slice(0, 2)).toEqual([
			EVENT.code,
			{ kind: 'tournament' }
		]);
	});

	it('tells the page when the Event is gone', async () => {
		const ongone = vi.fn();
		mocked.updateOrganizerEvent.mockRejectedValue(
			new AppError({ kind: 'not_found', status: 404, code: 'not_found', message: 'x', fields: {} })
		);
		await render(EventDialog, { open: true, event: EVENT, onsaved: vi.fn(), ongone });
		await dialog().getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
		await dialog().getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() => expect(ongone).toHaveBeenCalled());
		await expect.element(dialog().getByText(/can't be changed/)).toBeVisible();
	});
});
