import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import PlayerDetailsForm from './player-details-form.svelte';

/** Made-up details. */
async function fill() {
	await page.getByLabelText('Month').selectOptions('June');
	await page.getByLabelText('Year').fill('1990');
	await page.getByRole('radio', { name: 'Woman' }).click();
	await page.getByLabelText('First name').fill('Fern');
	await page.getByLabelText('Last name').fill('Mock');
}

describe('PlayerDetailsForm', () => {
	it('asks only for the birth month and year, the gender and the first and last name', async () => {
		await render(PlayerDetailsForm, { onsubmit: vi.fn() });
		await expect.element(page.getByRole('group', { name: 'Birth month and year' })).toBeVisible();
		await expect.element(page.getByLabelText('Month')).toBeVisible();
		await expect.element(page.getByLabelText('Year')).toHaveAttribute('inputmode', 'numeric');
		await expect.element(page.getByRole('radio', { name: 'Man' })).toBeVisible();
		await expect.element(page.getByRole('radio', { name: 'Woman' })).toBeVisible();
		const first = page.getByLabelText('First name');
		await expect.element(first).toHaveAttribute('name', 'first_name');
		await expect.element(first).toHaveAttribute('autocomplete', 'given-name');
		const last = page.getByLabelText('Last name');
		await expect.element(last).toHaveAttribute('name', 'last_name');
		await expect.element(last).toHaveAttribute('autocomplete', 'family-name');
		await expect.element(page.getByLabelText('Display name')).not.toBeInTheDocument();
		// Month, year, first and last name, plus the two radios. Nothing else.
		expect(page.getByRole('textbox').elements()).toHaveLength(3);
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
		await expect.element(page.getByText('Enter your first name.')).toBeVisible();
		await expect.element(page.getByText('Enter your last name.')).toBeVisible();
		await expect.element(page.getByLabelText('Year')).toHaveAttribute('aria-invalid', 'true');
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('sends only the five values the backend needs, never a display name', async () => {
		const onsubmit = vi.fn(async () => {});
		await render(PlayerDetailsForm, { onsubmit });
		await fill();
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		expect(onsubmit).toHaveBeenCalledWith({
			birth_month: 6,
			birth_year: 1990,
			gender_division: 'womens',
			first_name: 'Fern',
			last_name: 'Mock'
		});
	});

	it("shows the backend's error under its own field, and a problem below the button", async () => {
		await render(PlayerDetailsForm, {
			onsubmit: vi.fn(),
			errors: {
				birth_month: "This birth year and month can't be used.",
				last_name: 'Your first and last name together can be at most 63 characters.'
			},
			problem: 'Something went wrong on our side.'
		});
		await expect
			.element(page.getByLabelText('Month'))
			.toHaveAccessibleDescription("This birth year and month can't be used.");
		await expect
			.element(page.getByLabelText('Last name'))
			.toHaveAccessibleDescription(/at most 63 characters/);
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

	it('refuses a birth year in the future and sends nothing', async () => {
		const onsubmit = vi.fn();
		await render(PlayerDetailsForm, { onsubmit });
		await fill();
		await page.getByLabelText('Year').fill('2206');
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		await expect.element(page.getByText('Enter a birth year that has passed.')).toBeVisible();
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('hides an earlier server error when the client check fails on another field', async () => {
		const onsubmit = vi.fn();
		await render(PlayerDetailsForm, {
			onsubmit,
			errors: { first_name: 'Your first name can be at most 61 characters.' }
		});
		await fill();
		await page.getByLabelText('Year').fill('');
		await page.getByRole('button', { name: 'Save and show my code' }).click();
		await expect.element(page.getByText('Enter your birth year.')).toBeVisible();
		await expect.element(page.getByText(/at most 61 characters/)).not.toBeInTheDocument();
		expect(onsubmit).not.toHaveBeenCalled();
	});
});
