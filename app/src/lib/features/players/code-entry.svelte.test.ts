import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { buildCode } from '#lib/domain/index.js';
import CodeEntry from './code-entry.svelte';

const CODE = buildCode('player', '4RWN8TQ');

describe('CodeEntry', () => {
	it('has a labelled field and help text tied to it', async () => {
		const screen = await render(CodeEntry, { onsave: () => {} });
		const field = screen.getByLabelText('Your OPEN code');
		await expect.element(field).toBeVisible();
		await expect
			.element(field)
			.toHaveAttribute('aria-describedby', expect.stringContaining('help'));
		await expect.element(screen.getByText(/starts with P/)).toBeVisible();
	});

	it('shows the normalized code before saving, and saves it', async () => {
		const onsave = vi.fn();
		const screen = await render(CodeEntry, { onsave });
		await screen.getByLabelText('Your OPEN code').fill('p4rwn 8tq3');
		await expect.element(screen.getByText(`We will save it as ${CODE}`)).toBeVisible();
		await screen.getByRole('button', { name: 'Save code' }).click();
		expect(onsave).toHaveBeenCalledExactlyOnceWith(CODE);
	});

	it('says "looks right" when nothing needed fixing', async () => {
		const screen = await render(CodeEntry, { onsave: () => {} });
		await screen.getByLabelText('Your OPEN code').fill(CODE);
		await expect.element(screen.getByText(`Looks right: ${CODE}`)).toBeVisible();
	});

	it('names the problem for a code that fails the check, tied to the field', async () => {
		const onsave = vi.fn();
		const screen = await render(CodeEntry, { onsave });
		const field = screen.getByLabelText('Your OPEN code');
		await field.fill('P-4RWN-8TQ2');
		await expect.element(screen.getByText(/does not look right/)).toBeVisible();
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect
			.element(field)
			.toHaveAttribute('aria-describedby', expect.stringContaining('error'));
		await screen.getByRole('button', { name: 'Save code' }).click();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('does not scold a half-typed code until the field loses focus', async () => {
		const screen = await render(CodeEntry, { onsave: () => {} });
		const field = screen.getByLabelText('Your OPEN code');
		await field.fill('P-4RW');
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
		await userEvent.tab();
		await expect.element(screen.getByText(/wrong length/)).toBeVisible();
	});

	it('asks for a code when submitted empty, and puts focus in the field', async () => {
		const onsave = vi.fn();
		const screen = await render(CodeEntry, { onsave });
		await screen.getByRole('button', { name: 'Save code' }).click();
		await expect.element(screen.getByText(/Enter your OPEN code\./)).toBeVisible();
		await expect.element(screen.getByLabelText('Your OPEN code')).toHaveFocus();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('shows Cancel only when it can be cancelled', async () => {
		const oncancel = vi.fn();
		const without = await render(CodeEntry, { onsave: () => {} });
		await expect.element(without.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		without.unmount();

		const screen = await render(CodeEntry, { onsave: () => {}, oncancel });
		await screen.getByRole('button', { name: 'Cancel' }).click();
		expect(oncancel).toHaveBeenCalledOnce();
	});

	it('makes no claim about OPEN ratings and uses no em dash', async () => {
		const screen = await render(CodeEntry, { onsave: () => {} });
		const text = screen.container.textContent ?? '';
		expect(text).not.toMatch(/OPEN rating/i);
		expect(text).not.toContain('—');
	});
});
