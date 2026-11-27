/**
 * Defect F2: the delete dialog read the live `event` after the await, and could be closed while
 * the delete was in flight. A's answer could then close B's dialog, remove B's row, or show A's
 * refusal for B.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { AppError } from '#lib/api/index.js';
import type { OrganizerEvent } from '#lib/domain/index.js';
import * as services from '../services.js';
import { DELETE_PROTECTED } from '../copy.js';
import DeleteEventDialog from './delete-event-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	deleteOrganizerEvent: vi.fn()
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

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

const conflict = () =>
	new AppError({ kind: 'conflict', status: 409, code: 'conflict', message: 'x', fields: {} });

beforeEach(() => vi.resetAllMocks());

describe('DeleteEventDialog while the delete is in flight', () => {
	it('cannot be closed with Cancel or Escape', async () => {
		const answer = deferred();
		mocked.deleteOrganizerEvent.mockReturnValue(answer.promise);
		const ondeleted = vi.fn();
		await render(DeleteEventDialog, { open: true, event: A, ondeleted, ongone: vi.fn() });
		const dialog = page.getByRole('alertdialog', { name: 'Delete Made-up Event A?' });
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await dialog.getByRole('button', { name: 'Cancel' }).click({ force: true });
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).toBeVisible();
		answer.resolve();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(ondeleted).toHaveBeenCalledWith(A.code);
	});

	it("reports A's delete as A's, and leaves B's dialog alone", async () => {
		const answer = deferred();
		mocked.deleteOrganizerEvent.mockReturnValue(answer.promise);
		const ondeleted = vi.fn();
		const screen = await render(DeleteEventDialog, {
			open: true,
			event: A,
			ondeleted,
			ongone: vi.fn()
		});
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		expect(mocked.deleteOrganizerEvent).toHaveBeenCalledWith(A.code);
		await screen.rerender({ event: B });
		answer.resolve();
		await vi.waitFor(() => expect(ondeleted).toHaveBeenCalledWith(A.code));
		await expect
			.element(page.getByRole('alertdialog', { name: 'Delete Made-up Event B?' }))
			.toBeVisible();
	});

	it("does not show A's refusal on B", async () => {
		const answer = deferred();
		mocked.deleteOrganizerEvent.mockReturnValue(answer.promise);
		const screen = await render(DeleteEventDialog, {
			open: true,
			event: A,
			ondeleted: vi.fn(),
			ongone: vi.fn()
		});
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await screen.rerender({ event: B });
		answer.reject(conflict());
		await new Promise((resolve) => setTimeout(resolve, 50));
		await expect.element(page.getByText(DELETE_PROTECTED)).not.toBeInTheDocument();
	});
});
