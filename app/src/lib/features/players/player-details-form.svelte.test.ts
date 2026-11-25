import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import PlayerDetailsForm from './player-details-form.svelte';

/** Made-up details. */
async function fill() {
	await page.getByLabelText('Month').selectOptions('June');
	await page.getByLabelText('Year').fill('1990');
	await page.getByRole('radio', { name: 'Woman' }).click();
	await page.getByLabelText('Display name').fill('Fern Mock');
}

describe('PlayerDetailsForm', () => {
	it('asks only for the birth month and year, the gender and a display name', async () => {
		await render(PlayerDetailsForm, { onsubmit: vi.fn() });
		await expect.element(page.getByRole('group', { name: 'Birth month and year' })).toBeVisible();
		await expect.element(page.getByLabelText('Month')).toBeVisible();
		await expect.element(page.getByLabelText('Year')).toHaveAttribute('inputmode', 'numeric');
		await expect.element(page.getByRole('radio', { name: 'Man' })).toBeVisible();
		await expect.element(page.getByRole('radio', { name: 'Woman' })).toBeVisible();
		await expect.element(page.getByLabelText('Display name')).toBeVisible();
		// Month, year and display name, plus the two radios. Nothing else.
		expect(page.getByRole('textbox').elements()).toHaveLength(2);
		expect(page.getByRole('combobox').elements()).toHaveLength(1);
		expect(page.getByRole('radio').elements()).toHaveLength(2);
		expect(page.getByRole('checkbox').elements()).toHaveLength(0);
	});

	it('shows an error under each empty field and sends nothing', async () => {
		const onsubmit = vi.fn();
		await render(PlayerDetailsForm, { onsubmit });
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		await expect.element(page.getByText('Enter your birth month.')).toBeVisible();
		await expect.element(page.getByText('Enter your birth year.')).toBeVisible();
		await expect.element(page.getByText('Choose a gender division.')).toBeVisible();
		await expect.element(page.getByText('Enter a display name.')).toBeVisible();
		await expect.element(page.getByLabelText('Year')).toHaveAttribute('aria-invalid', 'true');
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('sends only the four values the backend needs', async () => {
		const onsubmit = vi.fn(async () => {});
		await render(PlayerDetailsForm, { onsubmit });
		await fill();
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		expect(onsubmit).toHaveBeenCalledWith({
			birth_month: 6,
			birth_year: 1990,
			gender_division: 'womens',
			display_name: 'Fern Mock'
		});
	});

	it("shows the backend's error under its own field, and a problem below the button", async () => {
		await render(PlayerDetailsForm, {
			onsubmit: vi.fn(),
			errors: {
				birth_month: "This birth year and month can't be used.",
				display_name: 'Ensure this value has at most 64 characters (it has 70).'
			},
			problem: 'Something went wrong on our side.'
		});
		await expect
			.element(page.getByLabelText('Month'))
			.toHaveAccessibleDescription("This birth year and month can't be used.");
		await expect
			.element(page.getByLabelText('Display name'))
			.toHaveAccessibleDescription(/at most 64 characters/);
		await expect
			.element(page.getByRole('alert').getByText('Something went wrong on our side.'))
			.toBeVisible();
	});

	it('is busy while the details are sent, so a second click sends nothing', async () => {
		let release = () => {};
		const onsubmit = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
		await render(PlayerDetailsForm, { onsubmit });
		await fill();
		const button = page.getByRole('button', { name: /Save and show my code|Saving/ });
		await button.click();
		await expect.element(button).toHaveAttribute('aria-busy', 'true');
		// aria-disabled keeps the button focusable, so a click still reaches it.
		(button.element() as HTMLElement).click();
		expect(onsubmit).toHaveBeenCalledTimes(1);
		release();
		await expect.element(button).toHaveAttribute('aria-busy', 'false');
	});
});
