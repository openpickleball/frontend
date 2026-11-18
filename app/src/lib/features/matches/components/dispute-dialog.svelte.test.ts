import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import DisputeDialog from './dispute-dialog.svelte';

describe('DisputeDialog', () => {
	it('asks for no reason, and says a dispute cannot be undone', async () => {
		await render(DisputeDialog, { open: true, onconfirm: vi.fn() });
		const dialog = page.getByRole('alertdialog', { name: 'Dispute this score?' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText(/undo a dispute/)).toBeVisible();
		await expect.element(dialog.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('opens with focus on Cancel, the safe choice', async () => {
		await render(DisputeDialog, { open: true, onconfirm: vi.fn() });
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('Cancel closes the dialog and disputes nothing', async () => {
		const onconfirm = vi.fn();
		await render(DisputeDialog, { open: true, onconfirm });
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('Escape closes it too', async () => {
		const onconfirm = vi.fn();
		await render(DisputeDialog, { open: true, onconfirm });
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('"Dispute score" disputes once and closes the dialog', async () => {
		const onconfirm = vi.fn();
		await render(DisputeDialog, { open: true, onconfirm });
		await page.getByRole('button', { name: 'Dispute score' }).click();
		expect(onconfirm).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});
});
