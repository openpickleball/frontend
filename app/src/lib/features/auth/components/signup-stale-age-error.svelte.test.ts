import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { PlaceSearch } from '#lib/features/places/index.js';
import { session } from '../session.svelte.js';
import { checkSignupAge, signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({ signup: vi.fn(), checkSignupAge: vi.fn() }));
const mockedCheckAge = vi.mocked(checkSignupAge);
vi.mocked(signup);

const REFUSED = "We can't create an account with these details.";

beforeEach(() => {
	session.apply({ status: 'signed_out' });
});

afterEach(() => {
	mockedCheckAge.mockReset();
	session.reset();
});

describe('SignupForm age check after a client error', () => {
	it('clears the old year message when the backend refuses the corrected age', async () => {
		mockedCheckAge.mockRejectedValue(
			new AppError({
				kind: 'validation',
				status: 400,
				code: 'signup_refused',
				message: REFUSED,
				fields: {}
			})
		);
		const places = new PlaceSearch({ search: async () => [], delay: 0 });
		const screen = await render(SignupForm, { onsuccess: vi.fn(), places });
		await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
		await screen.getByLabelText('Password', { exact: true }).fill('a-long-enough-pass');
		await screen.getByLabelText('Confirm password').fill('a-long-enough-pass');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await screen.getByLabelText('Month').selectOptions('6');

		const year = screen.getByLabelText('Year');
		await year.fill(String(new Date().getFullYear() + 1));
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByText('Enter a birth year that has passed.')).toBeVisible();
		expect(mockedCheckAge).not.toHaveBeenCalled();

		await year.fill('2020');
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByText(REFUSED)).toBeVisible();
		expect(mockedCheckAge).toHaveBeenCalledOnce();
		await expect
			.element(screen.getByText('Enter a birth year that has passed.'))
			.not.toBeInTheDocument();
		await expect.element(year).not.toHaveAttribute('aria-invalid');
		await expect.element(year).not.toHaveAccessibleDescription();
	});
});
