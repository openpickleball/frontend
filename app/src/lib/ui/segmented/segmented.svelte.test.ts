import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { Segmented } from './index.js';

const options = [
	{ value: 'singles', label: 'Singles' },
	{ value: 'doubles', label: 'Doubles' }
];

describe('Segmented', () => {
	it('is a group named by its label, with one radio per option', async () => {
		await render(Segmented, { name: 'format', label: 'Format', options, value: 'singles' });
		const group = page.getByRole('group', { name: 'Format' });
		await expect.element(group).toBeVisible();
		await expect.element(group.getByRole('radio', { name: 'Singles' })).toBeChecked();
		await expect.element(group.getByRole('radio', { name: 'Doubles' })).not.toBeChecked();
	});

	it('moves the choice with the arrow keys and keeps focus on it', async () => {
		const chosen = vi.fn();
		await render(Segmented, {
			name: 'format',
			label: 'Format',
			options,
			get value() {
				return 'singles';
			},
			set value(value: string) {
				chosen(value);
			}
		});
		const singles = page.getByRole('radio', { name: 'Singles' });
		await singles.click();
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(page.getByRole('radio', { name: 'Doubles' })).toHaveFocus();
		expect(chosen).toHaveBeenLastCalledWith('doubles');
	});

	it('puts its class on the track, so a page can let the pills wrap', async () => {
		await render(Segmented, {
			name: 'format',
			label: 'Format',
			options,
			value: 'singles',
			class: 'flex-wrap'
		});
		await expect.element(page.getByRole('radiogroup')).toHaveClass('flex-wrap');
	});
});
