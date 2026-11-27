/**
 * Defect F3: the Event dialog could close while saving. The old answer then closed a dialog
 * opened again since, and a refusal landed on the form it had thrown away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import EventDialog from './event-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	updateOrganizerEvent: vi.fn(),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

const event = (code: string, name: string): OrganizerEvent => ({
	code,
	name,
	kind: 'league',
	organizer: 'G-K7MQ-2RD4',
	club: null,
	startDate: '2026-11-02',
	endDate: '2026-12-14'
});
const A = event('E-SEED-000A', 'Made-up Event A');
const B = event('E-SEED-000B', 'Made-up Event B');

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.mfaEnrolled = true;
});
afterEach(() => session.reset());

const dialog = () => page.getByRole('dialog', { name: 'Edit Event' });

async function saveKind() {
	await dialog().getByRole('combobox', { name: 'Kind' }).selectOptions('tournament');
	await dialog().getByRole('button', { name: 'Save' }).click();
}

describe('EventDialog while saving', () => {
	it('cannot be closed with Cancel or Escape, and closes once saved', async () => {
		const answer = deferred<OrganizerEvent>();
		mocked.updateOrganizerEvent.mockReturnValue(answer.promise);
		const onsaved = vi.fn();
		await render(EventDialog, { open: true, event: A, onsaved, ongone: vi.fn() });
		await saveKind();
		await dialog().getByRole('button', { name: 'Cancel' }).click({ force: true });
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).toBeVisible();
		answer.resolve({ ...A, kind: 'tournament' });
		await expect.element(dialog()).not.toBeInTheDocument();
		expect(onsaved).toHaveBeenCalledWith({ ...A, kind: 'tournament' });
	});

	it('hands back a save that finished after the dialog was opened again, and stays open', async () => {
		const answer = deferred<OrganizerEvent>();
		mocked.updateOrganizerEvent.mockReturnValue(answer.promise);
		const onsaved = vi.fn();
		const screen = await render(EventDialog, { open: true, event: A, onsaved, ongone: vi.fn() });
		await saveKind();
		await screen.rerender({ open: false });
		await screen.rerender({ open: true, event: B });
		await expect.element(dialog().getByLabelText('Name')).toHaveValue(B.name);
		answer.resolve({ ...A, kind: 'tournament' });
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalledWith({ ...A, kind: 'tournament' }));
		await expect.element(dialog().getByLabelText('Name')).toHaveValue(B.name);
	});

	it('shows nothing on the new form when the old save is refused', async () => {
		const answer = deferred<OrganizerEvent>();
		mocked.updateOrganizerEvent.mockReturnValue(answer.promise);
		const screen = await render(EventDialog, {
			open: true,
			event: A,
			onsaved: vi.fn(),
			ongone: vi.fn()
		});
		await saveKind();
		await screen.rerender({ open: false });
		await screen.rerender({ open: true, event: B });
		answer.reject(
			new AppError({ kind: 'conflict', status: 409, code: 'conflict', message: 'x', fields: {} })
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog().getByRole('alert')).not.toBeInTheDocument();
		await expect.element(dialog().getByText(/This Event has matches/)).not.toBeInTheDocument();
	});
});
