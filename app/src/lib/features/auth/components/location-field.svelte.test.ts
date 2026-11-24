import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { PlaceSearch, type Place } from '#lib/features/places/index.js';
import LocationField from './location-field.svelte';

// Made-up places.
const RIVERBEND: Place = {
	city: 'Riverbend',
	region: 'Ohio',
	country: 'United States',
	label: 'Riverbend, Ohio, United States'
};
const MAPLE: Place = {
	city: 'Maple Hollow',
	region: 'Ontario',
	country: 'Canada',
	label: 'Maple Hollow, Ontario, Canada'
};

type SearchFn = (text: string, options?: { signal?: AbortSignal }) => Promise<Place[]>;

async function setup(
	options: { answer?: () => Promise<Place[]>; locked?: boolean; error?: string } = {}
) {
	const search = vi.fn<SearchFn>(options.answer ?? (async () => [RIVERBEND, MAPLE]));
	const places = new PlaceSearch({ search, delay: 0 });
	const onchange = vi.fn();
	const screen = await render(LocationField, {
		id: 'signup-city',
		label: 'City (optional)',
		value: { text: '', chosen: null },
		error: options.error ?? '',
		locked: options.locked ?? false,
		places,
		onchange
	});
	const box = screen.getByRole('combobox', { name: 'City (optional)' });
	return { screen, search, box, onchange };
}

describe('LocationField', () => {
	it('is a labelled combobox with no browser autocomplete', async () => {
		const { box } = await setup();
		await expect.element(box).toHaveAttribute('id', 'signup-city');
		await expect.element(box).toHaveAttribute('autocomplete', 'off');
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
	});

	it('does not search for one character', async () => {
		const { box, search } = await setup();
		await box.fill('R');
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(search).not.toHaveBeenCalled();
	});

	it('lists suggestions from two characters, by label', async () => {
		const { screen, box, search } = await setup();
		await box.fill('Ri');
		await expect
			.element(screen.getByRole('option', { name: 'Riverbend, Ohio, United States' }))
			.toBeVisible();
		await expect
			.element(screen.getByRole('option', { name: 'Maple Hollow, Ontario, Canada' }))
			.toBeVisible();
		expect(search.mock.calls[0]?.[0]).toBe('Ri');
	});

	it('sets the text and the chosen place when a suggestion is picked', async () => {
		const { screen, box, onchange } = await setup();
		await box.fill('Ri');
		await screen.getByRole('option', { name: 'Riverbend, Ohio, United States' }).click();

		await expect.element(box).toHaveValue('Riverbend, Ohio, United States');
		expect(onchange).toHaveBeenLastCalledWith({
			text: 'Riverbend, Ohio, United States',
			chosen: { city: 'Riverbend', region: 'Ohio' }
		});
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
	});

	it('forgets the chosen place when the text changes', async () => {
		const { screen, box, onchange } = await setup();
		await box.fill('Ri');
		await screen.getByRole('option', { name: 'Riverbend, Ohio, United States' }).click();
		await box.fill('Riverbend, Ohio');
		expect(onchange).toHaveBeenLastCalledWith({ text: 'Riverbend, Ohio', chosen: null });
		await box.fill('');
		expect(onchange).toHaveBeenLastCalledWith({ text: '', chosen: null });
	});

	it('says when the suggestions could not load, in a polite live region', async () => {
		const { screen, box } = await setup({
			answer: async () => {
				throw new Error('offline');
			}
		});
		await box.fill('Ri');
		const status = screen.getByRole('status');
		await expect.element(status).toHaveTextContent("We couldn't load suggestions. Try again.");
		await expect.element(status).toHaveAttribute('aria-live', 'polite');
	});

	it('shows its field error in place of the suggestion message', async () => {
		const { box, screen } = await setup({
			error: 'Choose your city from the list, or clear the field.'
		});
		await expect.element(box).toHaveAttribute('aria-invalid', 'true');
		await expect.element(box).toHaveAttribute('aria-describedby', 'signup-city-error');
		await expect
			.element(screen.getByText('Choose your city from the list, or clear the field.'))
			.toBeVisible();
	});

	it('never searches while locked', async () => {
		const { box, search } = await setup({ locked: true });
		await expect.element(box).toBeDisabled();
		// Even text set from outside does not start a search.
		(box.element() as HTMLInputElement).value = 'Riverbend';
		box.element().dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(search).not.toHaveBeenCalled();
	});
});
