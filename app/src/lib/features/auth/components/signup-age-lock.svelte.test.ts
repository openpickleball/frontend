import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { PlaceSearch, type Place } from '#lib/features/places/index.js';
import { session } from '../session.svelte.js';
import { checkSignupAge, signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({ signup: vi.fn(), checkSignupAge: vi.fn() }));
const mockedCheckAge = vi.mocked(checkSignupAge);
vi.mocked(signup);

type SearchFn = (text: string, options?: { signal?: AbortSignal }) => Promise<Place[]>;
type Screen = Awaited<ReturnType<typeof render>>;

const REFUSED = "We can't create an account with these details.";

beforeEach(() => {
	session.apply({ status: 'signed_out' });
	mockedCheckAge.mockResolvedValue(undefined);
});

afterEach(() => {
	mockedCheckAge.mockReset();
	session.reset();
});

async function open(search: SearchFn = async () => [], delay = 0): Promise<Screen> {
	const places = new PlaceSearch({ search, delay });
	const screen = await render(SignupForm, { onsuccess: vi.fn(), places });
	await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
	await screen.getByLabelText('Password', { exact: true }).fill('a-long-enough-pass');
	await screen.getByLabelText('Confirm password').fill('a-long-enough-pass');
	await screen.getByRole('button', { name: 'Continue' }).click();
	await screen.getByLabelText('Month').selectOptions('6');
	await screen.getByLabelText('Year').fill('1990');
	return screen;
}

describe('SignupForm age lock fixes', () => {
	it('locks the birth fields while the age check runs', async () => {
		mockedCheckAge.mockReturnValue(new Promise(() => {}));
		const screen = await open();
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByRole('button', { name: 'Checking…' })).toBeVisible();
		await expect.element(screen.getByLabelText('Month')).toBeDisabled();
		await expect.element(screen.getByLabelText('Year')).toBeDisabled();
	});

	it('shows an age check refusal next to the age Continue, outside the locked fields', async () => {
		mockedCheckAge.mockRejectedValue(
			new AppError({
				kind: 'validation',
				status: 400,
				code: 'signup_refused',
				message: REFUSED,
				fields: {}
			})
		);
		const screen = await open();
		const button = screen.getByRole('button', { name: 'Continue' }).element();
		await screen.getByRole('button', { name: 'Continue' }).click();

		const alert = screen.getByRole('alert');
		await expect.element(alert).toHaveTextContent(REFUSED);
		const node = alert.element();
		const gender = screen.getByRole('radiogroup', { name: 'Gender' }).element();
		expect(button.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(node.compareDocumentPosition(gender) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(node.closest('fieldset[disabled]')).toBeNull();
	});

	it('drops a city search still waiting when the fields relock', async () => {
		const search = vi.fn<SearchFn>(async () => []);
		const screen = await open(search, 300);
		await screen.getByRole('button', { name: 'Continue' }).click();
		await screen.getByRole('combobox', { name: 'City (optional)' }).fill('Ri');
		await screen.getByRole('button', { name: 'Change' }).click();
		await new Promise((resolve) => setTimeout(resolve, 450));
		expect(search).not.toHaveBeenCalled();
	});
});
