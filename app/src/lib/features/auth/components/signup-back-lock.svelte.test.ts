import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { PlaceSearch } from '#lib/features/places/index.js';
import { session } from '../session.svelte.js';
import { checkSignupAge, signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({
	signup: vi.fn(),
	checkSignupAge: vi.fn(),
	checkSignupPassword: vi.fn()
}));
const mockedSignup = vi.mocked(signup);
const mockedCheckAge = vi.mocked(checkSignupAge);

type Screen = Awaited<ReturnType<typeof render>>;

beforeEach(() => {
	session.apply({ status: 'signed_out' });
	mockedCheckAge.mockResolvedValue(undefined);
});

afterEach(() => {
	mockedSignup.mockReset();
	mockedCheckAge.mockReset();
	session.reset();
});

/** Screen 1 filled with made-up values, then screen 2 with an age filled in. */
async function open(): Promise<Screen> {
	const places = new PlaceSearch({ search: async () => [], delay: 0 });
	const screen = await render(SignupForm, { onsuccess: vi.fn(), places });
	await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
	await screen.getByLabelText('Password', { exact: true }).fill('a-long-enough-pass');
	await screen.getByLabelText('Confirm password').fill('a-long-enough-pass');
	await screen.getByRole('button', { name: 'Continue' }).click();
	await screen.getByLabelText('Month').selectOptions('6');
	await screen.getByLabelText('Year').fill('1990');
	return screen;
}

describe('SignupForm Back while an answer is pending', () => {
	it('disables Back while the age check runs', async () => {
		mockedCheckAge.mockReturnValue(new Promise(() => {}));
		const screen = await open();
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByRole('button', { name: 'Checking…' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
	});

	it('disables Back while Create account waits for the backend', async () => {
		mockedSignup.mockReturnValue(new Promise(() => {}));
		const screen = await open();
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByRole('button', { name: 'Change' })).toBeVisible();
		await screen.getByRole('radio', { name: 'Woman' }).click();
		await screen.getByLabelText('First name').fill('Tamsin');
		await screen.getByLabelText('Last name').fill('Vale');
		await screen.getByRole('checkbox', { name: /Terms of Service/ }).click();
		await screen.getByRole('checkbox', { name: /Privacy Policy/ }).click();
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.poll(() => mockedSignup).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
	});
});
