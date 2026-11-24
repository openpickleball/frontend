import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { PlaceSearch, type Place } from '#lib/features/places/index.js';
import { session } from '../session.svelte.js';
import { checkSignupAge, signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({ signup: vi.fn(), checkSignupAge: vi.fn() }));
const mockedSignup = vi.mocked(signup);
const mockedCheckAge = vi.mocked(checkSignupAge);

type SearchFn = (text: string, options?: { signal?: AbortSignal }) => Promise<Place[]>;

// A made-up place.
const RIVERBEND: Place = {
	city: 'Riverbend',
	region: 'Ohio',
	country: 'United States',
	label: 'Riverbend, Ohio, United States'
};

const REFUSED = "We can't create an account with these details.";
const EMAIL = 'tamsin.vale@example.com';
const PASSWORD = 'a-long-enough-pass';

function appError(overrides: Partial<AppErrorFields>): AppError {
	return new AppError({
		kind: 'validation',
		status: 400,
		code: 'error',
		message: 'Something went wrong.',
		fields: {},
		...overrides
	});
}

let search: ReturnType<typeof vi.fn<SearchFn>>;

beforeEach(() => {
	session.apply({ status: 'signed_out' });
	search = vi.fn<SearchFn>(async () => [RIVERBEND]);
	mockedCheckAge.mockResolvedValue(undefined);
});

afterEach(() => {
	mockedSignup.mockReset();
	mockedCheckAge.mockReset();
	session.reset();
});

type Screen = Awaited<ReturnType<typeof render>>;

async function open(): Promise<Screen> {
	const places = new PlaceSearch({ search, delay: 0 });
	return render(SignupForm, { onsuccess: vi.fn(), places });
}

function heading(screen: Screen, name: string) {
	return screen.getByRole('heading', { level: 1, name });
}

/** Screen 1: fill the account fields and press Continue. */
async function account(
	screen: Screen,
	{
		email = EMAIL,
		password = PASSWORD,
		confirm
	}: { email?: string; password?: string; confirm?: string } = {}
) {
	confirm ??= password;
	await screen.getByLabelText('Email').fill(email);
	await screen.getByLabelText('Password', { exact: true }).fill(password);
	await screen.getByLabelText('Confirm password').fill(confirm);
	await screen.getByRole('button', { name: 'Continue' }).click();
}

/** Screen 2: fill the birth month and year and press Continue under them. */
async function age(screen: Screen, { month = '6', year = '1990' } = {}) {
	await screen.getByLabelText('Month').selectOptions(month);
	await screen.getByLabelText('Year').fill(year);
	await screen.getByRole('button', { name: 'Continue' }).click();
}

type Details = {
	gender: 'Man' | 'Woman' | null;
	first: string;
	last: string;
	terms: boolean;
	privacy: boolean;
};

/** Screen 2, after the age check: fill the rest as a made-up adult would. */
async function details(screen: Screen, overrides: Partial<Details> = {}) {
	const { gender, first, last, terms, privacy }: Details = {
		gender: 'Man',
		first: 'Tamsin',
		last: 'Vale',
		terms: true,
		privacy: true,
		...overrides
	};
	if (gender) await screen.getByRole('radio', { name: gender }).click();
	await screen.getByLabelText('First name').fill(first);
	await screen.getByLabelText('Last name').fill(last);
	if (terms) await screen.getByRole('checkbox', { name: /Terms of Service/ }).click();
	if (privacy) await screen.getByRole('checkbox', { name: /Privacy Policy/ }).click();
}

/** Both screens, up to Create account. */
async function ready(screen: Screen, overrides: Partial<Details> = {}) {
	await account(screen);
	await age(screen);
	await expect.element(screen.getByRole('button', { name: 'Change' })).toBeVisible();
	await details(screen, overrides);
}

async function create(screen: Screen) {
	await screen.getByRole('button', { name: 'Create account' }).click();
}

/** Everything the age lock covers. */
function locked(screen: Screen) {
	return [
		screen.getByRole('radio', { name: 'Man' }),
		screen.getByRole('radio', { name: 'Woman' }),
		screen.getByLabelText('First name'),
		screen.getByLabelText('Last name'),
		screen.getByRole('combobox', { name: 'City (optional)' }),
		screen.getByRole('checkbox', { name: /Terms of Service/ }),
		screen.getByRole('checkbox', { name: /Privacy Policy/ }),
		screen.getByRole('button', { name: 'Create account' })
	];
}

describe('SignupForm, screen 1', () => {
	it('asks for the email and passwords first, under step 1 of 2', async () => {
		const screen = await open();
		await expect.element(heading(screen, 'Create account')).toBeVisible();
		await expect.element(screen.getByText('Step 1 of 2')).toBeVisible();
		const ids = [...document.querySelectorAll('form input, form select')].map((e) => e.id);
		expect(ids).toEqual(['signup-email', 'signup-password', 'signup-password_confirm']);
		await expect.element(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
		expect(document.title).toBe('Create account · OPEN Pickleball');
	});

	it('checks empty fields on the client and sends nothing', async () => {
		const screen = await open();
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		await expect.element(screen.getByText('Use at least 8 characters.')).toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toHaveFocus();
		await expect.element(heading(screen, 'Create account')).toBeVisible();
		expect(mockedSignup).not.toHaveBeenCalled();
		expect(mockedCheckAge).not.toHaveBeenCalled();
	});

	it('checks the email and the password length', async () => {
		const screen = await open();
		await account(screen, { email: 'nope', password: 'short' });

		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		await expect.element(screen.getByText('Use at least 8 characters.')).toBeVisible();
		const password = screen.getByLabelText('Password', { exact: true });
		await expect.element(password).toHaveAttribute('aria-invalid', 'true');
		// The error takes the hint's place, and the field points at it.
		await expect.element(password).toHaveAttribute('aria-describedby', 'signup-password-error');
	});

	it('says when the passwords do not match, and stays', async () => {
		const screen = await open();
		await account(screen, { confirm: 'a-long-enough-pas' });

		await expect.element(screen.getByText("The passwords don't match.")).toBeVisible();
		const confirm = screen.getByLabelText('Confirm password');
		await expect.element(confirm).toHaveAttribute('aria-invalid', 'true');
		await expect.element(confirm).toHaveFocus();
		await expect.element(heading(screen, 'Create account')).toBeVisible();
	});

	it('gives the confirm field its own Show button', async () => {
		const screen = await open();
		const confirm = screen.getByLabelText('Confirm password');
		await expect.element(confirm).toHaveAttribute('type', 'password');
		await screen.getByRole('button', { name: 'Show confirm password' }).click();
		await expect.element(confirm).toHaveAttribute('type', 'text');
		await expect
			.element(screen.getByLabelText('Password', { exact: true }))
			.toHaveAttribute('type', 'password');
	});

	it('moves on to "About you" with valid values, with focus on the heading', async () => {
		const screen = await open();
		await account(screen);

		const about = heading(screen, 'About you');
		await expect.element(about).toBeVisible();
		await expect.element(about).toHaveFocus();
		await expect.element(screen.getByText('Step 2 of 2')).toBeVisible();
		await expect.poll(() => document.title).toBe('About you · OPEN Pickleball');
		expect(mockedSignup).not.toHaveBeenCalled();
		expect(mockedCheckAge).not.toHaveBeenCalled();
	});

	it('keeps every value on Back and on returning', async () => {
		const screen = await open();
		await account(screen);
		await age(screen);
		await details(screen, { first: 'Oren', last: 'Quill' });
		await screen.getByRole('button', { name: 'Back' }).click();

		await expect.element(heading(screen, 'Create account')).toHaveFocus();
		await expect.element(screen.getByLabelText('Email')).toHaveValue(EMAIL);
		await expect.element(screen.getByLabelText('Password', { exact: true })).toHaveValue(PASSWORD);
		await expect.element(screen.getByLabelText('Confirm password')).toHaveValue(PASSWORD);

		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByLabelText('Month')).toHaveValue('6');
		await expect.element(screen.getByLabelText('Year')).toHaveValue('1990');
		await expect.element(screen.getByRole('radio', { name: 'Man' })).toBeChecked();
		await expect.element(screen.getByLabelText('First name')).toHaveValue('Oren');
		await expect.element(screen.getByLabelText('Last name')).toHaveValue('Quill');
		await expect.element(screen.getByRole('checkbox', { name: /Terms of Service/ })).toBeChecked();
		// The age passed already, so the rest is still open.
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
	});
});

describe('SignupForm, screen 2 layout', () => {
	it('asks for the age first, then the rest, in page order', async () => {
		const screen = await open();
		await account(screen);
		await expect.element(heading(screen, 'About you')).toBeVisible();
		const ids = [...document.querySelectorAll('form select, form input, form [role=radio]')]
			.map((element) => element.id)
			.filter(Boolean);
		expect(ids).toEqual([
			'signup-birth_month',
			'signup-birth_year',
			'signup-gender_division',
			'signup-gender_division-womens',
			'signup-first_name',
			'signup-last_name',
			'signup-city',
			'signup-accepted_terms',
			'signup-accepted_privacy'
		]);
		await expect
			.element(screen.getByRole('group', { name: 'Birth month and year' }))
			.toHaveAccessibleDescription('We only ask for the month and year.');
		await expect.element(screen.getByRole('radiogroup', { name: 'Gender' })).toBeVisible();
	});

	it('offers the twelve months by name, with numbers as values', async () => {
		const screen = await open();
		await account(screen);
		const month = screen.getByLabelText('Month');
		await expect.element(month).toHaveAttribute('autocomplete', 'bday-month');
		const options = [...(month.element() as HTMLSelectElement).options];
		expect(options.map((option) => option.value)).toEqual([
			'',
			...Array.from({ length: 12 }, (_, i) => String(i + 1))
		]);
		expect(options[6]?.textContent?.trim()).toBe('June');
		const year = screen.getByLabelText('Year');
		await expect.element(year).toHaveAttribute('inputmode', 'numeric');
		await expect.element(year).toHaveAttribute('autocomplete', 'bday-year');
	});

	it('wires the names for autofill', async () => {
		const screen = await open();
		await account(screen);
		const first = screen.getByLabelText('First name');
		await expect.element(first).toHaveAttribute('name', 'first_name');
		await expect.element(first).toHaveAttribute('autocomplete', 'given-name');
		const last = screen.getByLabelText('Last name');
		await expect.element(last).toHaveAttribute('name', 'last_name');
		await expect.element(last).toHaveAttribute('autocomplete', 'family-name');
	});

	it('marks the gender group as required', async () => {
		const screen = await open();
		await account(screen);
		await expect
			.element(screen.getByRole('radiogroup', { name: 'Gender' }))
			.toHaveAttribute('aria-required', 'true');
	});

	it('links each agreement to its page, in a new tab', async () => {
		const screen = await open();
		await account(screen);
		for (const [name, href] of [
			['Terms of Service', 'https://www.openpb.org/terms/'],
			['Privacy Policy', 'https://www.openpb.org/privacy/']
		]) {
			const link = screen.getByRole('link', { name: `${name} (opens in a new tab)` });
			await expect.element(link).toHaveAttribute('href', href);
			await expect.element(link).toHaveAttribute('target', '_blank');
			await expect.element(link).toHaveAttribute('rel', 'noopener');
		}
	});

	it('never names an age limit', async () => {
		const screen = await open();
		expect(document.body.textContent).not.toContain('13');
		await account(screen);
		await expect.element(heading(screen, 'About you')).toBeVisible();
		expect(document.body.textContent).not.toContain('13');
	});
});

describe('SignupForm, age lock', () => {
	it('locks everything below the age until the check passes', async () => {
		const screen = await open();
		await account(screen);
		for (const control of locked(screen)) await expect.element(control).toBeDisabled();

		await age(screen);
		expect(mockedCheckAge).toHaveBeenCalledWith({ birth_month: 6, birth_year: 1990 });
		for (const control of locked(screen)) await expect.element(control).toBeEnabled();
		await expect.element(screen.getByLabelText('Month')).toBeDisabled();
		await expect.element(screen.getByLabelText('Year')).toBeDisabled();
		await expect.element(screen.getByRole('radio', { name: 'Man' })).toHaveFocus();
	});

	it('shows the pending state while the check runs', async () => {
		let finish: () => void = () => {};
		mockedCheckAge.mockReturnValue(new Promise((resolve) => (finish = () => resolve())));
		const screen = await open();
		await account(screen);
		await age(screen);

		const busy = screen.getByRole('button', { name: 'Checking…' });
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish();
		await expect.element(screen.getByRole('button', { name: 'Change' })).toBeVisible();
	});

	it('asks for an empty month and year, and checks nothing', async () => {
		const screen = await open();
		await account(screen);
		await screen.getByRole('button', { name: 'Continue' }).click();

		await expect.element(screen.getByText('Enter your birth month.')).toBeVisible();
		await expect.element(screen.getByText('Enter your birth year.')).toBeVisible();
		const month = screen.getByLabelText('Month');
		await expect.element(month).toHaveAttribute('aria-invalid', 'true');
		await expect.element(month).toHaveAttribute('aria-describedby', 'signup-birth_month-error');
		await expect.element(screen.getByLabelText('Year')).toHaveAttribute('aria-invalid', 'true');
		await expect.element(month).toHaveFocus();
		expect(mockedCheckAge).not.toHaveBeenCalled();
	});

	it.each([
		['abcd', 'Enter your birth year.'],
		['1899', 'Enter a birth year of 1900 or later.'],
		[String(new Date().getFullYear() + 1), 'Enter a birth year that has passed.']
	])('refuses the year %j on the year field', async (year, message) => {
		const screen = await open();
		await account(screen);
		await age(screen, { year });

		await expect.element(screen.getByText(message)).toBeVisible();
		const field = screen.getByLabelText('Year');
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(field).toHaveFocus();
		expect(mockedCheckAge).not.toHaveBeenCalled();
	});

	it.each([' 1990', '01990'])('reads a pasted year %j as 1990', async (year) => {
		const screen = await open();
		await account(screen);
		await age(screen, { year });
		await expect.poll(() => mockedCheckAge.mock.calls.length).toBe(1);
		expect(mockedCheckAge.mock.calls[0]?.[0]).toEqual({ birth_month: 6, birth_year: 1990 });
	});

	it('sends a recent birth year: the backend decides the minimum age', async () => {
		const year = new Date().getFullYear() - 5;
		const screen = await open();
		await account(screen);
		await age(screen, { month: '1', year: String(year) });
		await expect.poll(() => mockedCheckAge.mock.calls.length).toBe(1);
		expect(mockedCheckAge.mock.calls[0]?.[0]).toEqual({ birth_month: 1, birth_year: year });
	});

	it('shows the refusal as the form alert, and keeps the rest locked', async () => {
		mockedCheckAge.mockRejectedValue(
			appError({ code: 'signup_refused', message: REFUSED, fields: {} })
		);
		const screen = await open();
		await account(screen);
		await age(screen);

		const alert = screen.getByRole('alert');
		await expect.element(alert).toHaveTextContent(REFUSED);
		expect(alert.element().textContent?.trim()).toBe(REFUSED);
		expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
		for (const control of locked(screen)) await expect.element(control).toBeDisabled();
		await expect.element(screen.getByLabelText('Month')).toBeEnabled();
	});

	it('puts the backend birth year message on the year field', async () => {
		mockedCheckAge.mockRejectedValue(
			appError({ fields: { birth_year: ['Enter a birth year of 1900 or later.'] } })
		);
		const screen = await open();
		await account(screen);
		await age(screen);

		await expect.element(screen.getByText('Enter a birth year of 1900 or later.')).toBeVisible();
		const year = screen.getByLabelText('Year');
		await expect.element(year).toHaveAttribute('aria-invalid', 'true');
		await expect.element(year).toHaveFocus();
		expect(document.querySelector('[data-slot="alert"]')).toBeNull();
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
	});

	it('shows the throttled message and stays locked', async () => {
		mockedCheckAge.mockRejectedValue(
			appError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.'
			})
		);
		const screen = await open();
		await account(screen);
		await age(screen);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many attempts. Wait a moment and try again.');
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
	});

	it('runs the age check on Enter in the year', async () => {
		const screen = await open();
		await account(screen);
		await screen.getByLabelText('Month').selectOptions('6');
		await screen.getByLabelText('Year').fill('1990');
		await userEvent.keyboard('{Enter}');

		await expect.element(screen.getByRole('button', { name: 'Change' })).toBeVisible();
		expect(mockedCheckAge).toHaveBeenCalledWith({ birth_month: 6, birth_year: 1990 });
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('keeps Change off while Create account waits', async () => {
		mockedSignup.mockReturnValue(new Promise(() => {}));
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect.element(screen.getByRole('button', { name: 'Creating account…' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Change' })).toBeDisabled();
	});

	it('relocks the rest on Change, and checks again', async () => {
		const screen = await open();
		await account(screen);
		await age(screen);
		await screen.getByRole('button', { name: 'Change' }).click();

		const month = screen.getByLabelText('Month');
		await expect.element(month).toBeEnabled();
		await expect.element(month).toHaveFocus();
		for (const control of locked(screen)) await expect.element(control).toBeDisabled();
		await age(screen, { year: '1991' });
		expect(mockedCheckAge).toHaveBeenLastCalledWith({ birth_month: 6, birth_year: 1991 });
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
	});
});

describe('SignupForm, Create account', () => {
	it('sends every field with the right types, then shows check your email', async () => {
		mockedSignup.mockImplementation(async ({ email }) => {
			session.apply({ status: 'pending_verification' }, email);
			return { status: 'pending_verification' };
		});
		const screen = await open();
		await account(screen, { email: 'Tamsin.Vale@Example.com' });
		await age(screen);
		await details(screen, { gender: 'Woman', first: '  Tamsin ', last: 'Vale' });
		await create(screen);

		await expect.element(heading(screen, 'Check your email')).toBeVisible();
		await expect.element(screen.getByText(EMAIL)).toBeVisible();
		await expect.poll(() => document.title).toBe('Check your email · OPEN Pickleball');
		expect(mockedSignup).toHaveBeenCalledWith({
			email: EMAIL,
			password: PASSWORD,
			birth_month: 6,
			birth_year: 1990,
			gender_division: 'womens',
			first_name: 'Tamsin',
			last_name: 'Vale',
			accepted_terms: true,
			accepted_privacy: true
		});
	});

	it('shows the pending state while it waits', async () => {
		let finish: () => void = () => {};
		mockedSignup.mockReturnValue(
			new Promise((resolve) => (finish = () => resolve({ status: 'pending_verification' })))
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		const busy = screen.getByRole('button', { name: 'Creating account…' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish();
		await expect.element(heading(screen, 'Create account')).toBeVisible();
	});

	it('calls onsuccess when the backend signs the player in', async () => {
		mockedSignup.mockResolvedValue({ status: 'signed_in' } as Awaited<ReturnType<typeof signup>>);
		const onsuccess = vi.fn();
		const places = new PlaceSearch({ search, delay: 0 });
		const screen = await render(SignupForm, { onsuccess, places });
		await ready(screen);
		await create(screen);
		await expect.poll(() => onsuccess.mock.calls.length).toBe(1);
	});

	it('asks for man or woman when neither is chosen', async () => {
		const screen = await open();
		await ready(screen, { gender: null });
		await create(screen);

		await expect.element(screen.getByText('Choose man or woman.')).toBeVisible();
		const group = screen.getByRole('radiogroup', { name: 'Gender' });
		await expect.element(group).toHaveAttribute('aria-invalid', 'true');
		await expect.element(group).toHaveAccessibleDescription('Choose man or woman.');
		await expect.element(screen.getByRole('radio', { name: 'Man' })).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('asks for both names', async () => {
		const screen = await open();
		await ready(screen, { first: ' ', last: '' });
		await create(screen);

		await expect.element(screen.getByText('Enter your first name.')).toBeVisible();
		await expect.element(screen.getByText('Enter your last name.')).toBeVisible();
		await expect.element(screen.getByLabelText('First name')).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('keeps the first name to 61 characters', async () => {
		const screen = await open();
		await ready(screen, { first: 'a'.repeat(62) });
		await create(screen);

		await expect
			.element(screen.getByText('Your first name can be at most 61 characters.'))
			.toBeVisible();
		await expect
			.element(screen.getByLabelText('First name'))
			.toHaveAttribute('aria-invalid', 'true');
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('keeps the first and last name together to 63 characters, on the last name', async () => {
		const message = 'Your first and last name together can be at most 63 characters.';
		const screen = await open();
		// 30 + a space + 35 is 66 characters, over the 64 the backend allows.
		await ready(screen, { first: 'a'.repeat(30), last: 'b'.repeat(35) });
		await create(screen);

		const last = screen.getByLabelText('Last name');
		await expect.element(last).toHaveAccessibleDescription(message);
		await expect.element(last).toHaveAttribute('aria-invalid', 'true');
		await expect.element(last).toHaveFocus();
		await expect
			.element(screen.getByLabelText('First name'))
			.not.toHaveAttribute('aria-invalid', 'true');
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it.each([
		['Terms of Service', 'Accept the Terms of Service.', { terms: false }],
		['Privacy Policy', 'Accept the Privacy Policy.', { privacy: false }]
	])('asks to accept the %s', async (name, message, overrides) => {
		const screen = await open();
		await ready(screen, overrides);
		await create(screen);

		await expect.element(screen.getByText(message)).toBeVisible();
		const box = screen.getByRole('checkbox', { name: new RegExp(name) });
		await expect.element(box).toHaveAttribute('aria-invalid', 'true');
		await expect.element(box).toHaveAccessibleDescription(message);
		await expect.element(box).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('sends the chosen city and region', async () => {
		mockedSignup.mockResolvedValue({ status: 'pending_verification' });
		const screen = await open();
		await ready(screen);
		await screen.getByRole('combobox', { name: 'City (optional)' }).fill('Ri');
		await screen.getByRole('option', { name: 'Riverbend, Ohio, United States' }).click();
		await create(screen);

		await expect.poll(() => mockedSignup.mock.calls.length).toBe(1);
		expect(mockedSignup.mock.calls[0]?.[0]).toMatchObject({ city: 'Riverbend', region: 'Ohio' });
	});

	it('sends no city or region when the field is empty', async () => {
		mockedSignup.mockResolvedValue({ status: 'pending_verification' });
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect.poll(() => mockedSignup.mock.calls.length).toBe(1);
		const body = mockedSignup.mock.calls[0]?.[0] ?? {};
		expect('city' in body).toBe(false);
		expect('region' in body).toBe(false);
	});

	it('asks to choose from the list when the city was typed, not chosen', async () => {
		const screen = await open();
		await ready(screen);
		const city = screen.getByRole('combobox', { name: 'City (optional)' });
		await city.fill('Ri');
		await screen.getByRole('option', { name: 'Riverbend, Ohio, United States' }).click();
		// Editing after the choice forgets it.
		await city.fill('Riverbend, Ohi');
		await create(screen);

		await expect
			.element(screen.getByText('Choose your city from the list, or clear the field.'))
			.toBeVisible();
		await expect.element(city).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('still sends with City empty when suggestions fail', async () => {
		search.mockRejectedValue(new Error('offline'));
		mockedSignup.mockResolvedValue({ status: 'pending_verification' });
		const screen = await open();
		await ready(screen);
		const city = screen.getByRole('combobox', { name: 'City (optional)' });
		await city.fill('Ri');
		await expect
			.element(
				screen.getByText("We couldn't load suggestions. Try again.", { exact: true }).first()
			)
			.toBeVisible();
		await city.fill('');
		await create(screen);
		await expect.poll(() => mockedSignup.mock.calls.length).toBe(1);
	});

	it('asks Photon nothing while locked', async () => {
		const screen = await open();
		await account(screen);
		const city = screen.getByRole('combobox', { name: 'City (optional)' });
		await expect.element(city).toBeDisabled();
		// Even text set from outside does not start a search.
		(city.element() as HTMLInputElement).value = 'Riverbend';
		city.element().dispatchEvent(new Event('input', { bubbles: true }));
		await age(screen);
		await screen.getByRole('button', { name: 'Change' }).click();
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(search).not.toHaveBeenCalled();
	});

	it('returns to screen 1 for a server email error, keeping screen 2', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { email: ['A user is already registered with this email address.'] } })
		);
		const screen = await open();
		await ready(screen, { first: 'Oren' });
		await create(screen);

		await expect.element(heading(screen, 'Create account')).toBeVisible();
		await expect
			.element(screen.getByText('A user is already registered with this email address.'))
			.toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toHaveFocus();

		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByLabelText('First name')).toHaveValue('Oren');
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
	});

	it('puts the backend password message on screen 1', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { password: ['This password is too common.'] } })
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect.element(screen.getByText('This password is too common.')).toBeVisible();
		const password = screen.getByLabelText('Password', { exact: true });
		await expect.element(password).toHaveAttribute('aria-invalid', 'true');
		await expect.element(password).toHaveFocus();
	});

	it('puts the backend gender message on the gender field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { gender_division: ['Choose one of the listed options.'] } })
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect
			.element(screen.getByRole('radiogroup', { name: 'Gender' }))
			.toHaveAccessibleDescription('Choose one of the listed options.');
	});

	it('puts the backend last name message on the last name field', async () => {
		mockedSignup.mockRejectedValue(appError({ fields: { last_name: ['Enter text.'] } }));
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect.element(heading(screen, 'About you')).toBeVisible();
		const last = screen.getByLabelText('Last name');
		await expect.element(last).toHaveAccessibleDescription('Enter text.');
		await expect.element(last).toHaveAttribute('aria-invalid', 'true');
		await expect.element(last).toHaveFocus();
	});

	it('puts a backend region message on the City field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { region: ['Enter at most 100 characters.'] } })
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		const city = screen.getByRole('combobox', { name: 'City (optional)' });
		await expect.element(city).toHaveAccessibleDescription('Enter at most 100 characters.');
		await expect.element(city).toHaveFocus();
	});

	it('puts a backend birth year message on the year field, unlocked to fix it', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { birth_year: ['Enter a birth year of 1900 or later.'] } })
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		const year = screen.getByLabelText('Year');
		await expect.element(year).toHaveAccessibleDescription('Enter a birth year of 1900 or later.');
		await expect.element(year).toBeEnabled();
		await expect.element(year).toHaveFocus();
		await expect.element(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
	});

	it('shows the refusal as the form alert on screen 2, and nothing more', async () => {
		mockedSignup.mockRejectedValue(
			appError({ code: 'signup_refused', message: REFUSED, fields: {} })
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		const alert = screen.getByRole('alert');
		await expect.element(alert).toHaveTextContent(REFUSED);
		expect(alert.element().textContent?.trim()).toBe(REFUSED);
		expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
		await expect.element(heading(screen, 'About you')).toBeVisible();
	});

	it('shows the throttled message', async () => {
		mockedSignup.mockRejectedValue(
			appError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.'
			})
		);
		const screen = await open();
		await ready(screen);
		await create(screen);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many attempts. Wait a moment and try again.');
	});
});

describe('SignupForm, check your email', () => {
	it('offers signing in again for a new link, not a resend button', async () => {
		session.apply({ status: 'pending_verification' }, EMAIL);
		const screen = await open();

		await expect.element(screen.getByText(/Sign in again with the same email/)).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: /resend|send it again/i }))
			.not.toBeInTheDocument();
	});

	it('links to sign in without clearing the pending state', async () => {
		session.apply({ status: 'pending_verification' }, EMAIL);
		const screen = await open();
		await expect
			.element(screen.getByRole('link', { name: 'Go to sign in' }))
			.toHaveAttribute('href', '/account/login');
		expect(session.status).toBe('pending_verification');
	});

	it('goes back to the form from "Start over"', async () => {
		session.apply({ status: 'pending_verification' }, EMAIL);
		const screen = await open();
		await screen.getByRole('button', { name: 'Start over' }).click();
		await expect.element(heading(screen, 'Create account')).toBeVisible();
	});
});
