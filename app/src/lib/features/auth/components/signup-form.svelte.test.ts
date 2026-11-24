import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { session } from '../session.svelte.js';
import { signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({ signup: vi.fn() }));
const mockedSignup = vi.mocked(signup);

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

beforeEach(() => {
	session.apply({ status: 'signed_out' });
});

afterEach(() => {
	mockedSignup.mockReset();
	session.reset();
});

type Details = { month: string; year: string; gender: 'Man' | 'Woman' | null; confirm: string };

/** Fill the form as a made-up adult would. `details` overrides the birth date, gender or confirmation. */
async function fill(
	screen: Awaited<ReturnType<typeof render>>,
	email: string,
	password: string,
	details: Partial<Details> = {}
) {
	const { month, year, gender, confirm }: Details = {
		month: '6',
		year: '1990',
		gender: 'Man',
		confirm: password,
		...details
	};
	await screen.getByLabelText('Month').selectOptions(month);
	await screen.getByLabelText('Year').fill(year);
	if (gender) await screen.getByRole('radio', { name: gender }).click();
	await screen.getByLabelText('Email').fill(email);
	await screen.getByLabelText('Password', { exact: true }).fill(password);
	await screen.getByLabelText('Confirm password').fill(confirm);
}

async function submitForm(screen: Awaited<ReturnType<typeof render>>) {
	await screen.getByRole('button', { name: 'Create account' }).click();
}

describe('SignupForm', () => {
	it('checks the email and the password length on the client', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'nope', 'short');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		await expect.element(screen.getByText('Use at least 8 characters.')).toBeVisible();
		const password = screen.getByLabelText('Password', { exact: true });
		await expect.element(password).toHaveAttribute('aria-invalid', 'true');
		// The error takes the hint's place, and the field points at it.
		await expect.element(password).toHaveAttribute('aria-describedby', 'signup-password-error');
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('says under the button that creating an account agrees to the Terms and Privacy', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		const line = screen.getByText(/^By creating an account you agree to/);
		await expect.element(line).toBeVisible();
		// The links add "(opens in a new tab)" for screen readers only, so leave it out here.
		const seen = line.element().textContent!.replaceAll(' (opens in a new tab)', '');
		expect(seen.replace(/\s+/g, ' ').trim()).toBe(
			'By creating an account you agree to the Terms of Service and Privacy Policy.'
		);

		const button = screen.getByRole('button', { name: 'Create account' }).element();
		// Directly under the button: no other element sits between them.
		expect(button.nextElementSibling).toBe(line.element());
	});

	it('opens the Terms of Service and Privacy Policy on openpb.org in a new tab', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		for (const [name, href] of [
			['Terms of Service (opens in a new tab)', 'https://openpb.org/terms/'],
			['Privacy Policy (opens in a new tab)', 'https://openpb.org/privacy/']
		]) {
			const link = screen.getByRole('link', { name, exact: true });
			await expect.element(link).toHaveAttribute('href', href);
			await expect.element(link).toHaveAttribute('target', '_blank');
			await expect.element(link).toHaveAttribute('rel', 'noopener');
		}
	});

	it('leaves the Terms line off the check your email view', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Check your email' }))
			.toBeVisible();
		await expect.element(screen.getByRole('link', { name: /Terms/ })).not.toBeInTheDocument();
	});

	it('shows check your email after a sign-up, with the address', async () => {
		mockedSignup.mockImplementation(async ({ email }) => {
			session.apply({ status: 'pending_verification' }, email);
			return { status: 'pending_verification' };
		});
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'Tamsin.Vale@Example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Check your email' }))
			.toBeVisible();
		await expect.element(screen.getByText('tamsin.vale@example.com')).toBeVisible();
		await expect.poll(() => document.title).toBe('Check your email · OPEN Pickleball');
		expect(mockedSignup).toHaveBeenCalledWith({
			birth_month: 6,
			birth_year: 1990,
			gender_division: 'mens',
			email: 'tamsin.vale@example.com',
			password: 'a-long-enough-pass'
		});
	});

	it('offers signing in again for a new link, not a resend button', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });

		await expect.element(screen.getByText(/Sign in again with the same email/)).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: /resend|send it again/i }))
			.not.toBeInTheDocument();
	});

	it('links to sign in without clearing the pending state', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await expect
			.element(screen.getByRole('link', { name: 'Go to sign in' }))
			.toHaveAttribute('href', '/account/login');
		expect(session.status).toBe('pending_verification');
	});

	it('goes back to the form from "Start over"', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await screen.getByRole('button', { name: 'Start over' }).click();
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Create account' }))
			.toBeVisible();
	});

	it('shows the pending state while it waits', async () => {
		let finish: () => void = () => {};
		mockedSignup.mockReturnValue(
			new Promise((resolve) => (finish = () => resolve({ status: 'pending_verification' })))
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		const busy = screen.getByRole('button', { name: 'Creating account…' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish();
		await expect
			.element(screen.getByRole('button', { name: 'Create account' }))
			.not.toHaveAttribute('aria-disabled', 'true');
	});

	it('puts the backend password messages next to the password field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { password: ['This password is too common.'] } })
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'password123');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByText('This password is too common.')).toBeVisible();
		await expect
			.element(screen.getByLabelText('Password', { exact: true }))
			.toHaveAttribute('aria-invalid', 'true');
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
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText('Too many attempts. Wait a moment and try again.'))
			.toBeVisible();
	});

	it('asks for the birth month and year, then the gender, above the email', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		// The controls a player reaches, in page order (not the radio group's hidden form input).
		const ids = [...document.querySelectorAll('form select, form input, form [role=radio]')]
			.map((element) => element.id)
			.filter(Boolean);
		expect(ids).toEqual([
			'signup-birth_month',
			'signup-birth_year',
			'signup-gender_division',
			'signup-gender_division-womens',
			'signup-email',
			'signup-password',
			'signup-password_confirm'
		]);
		await expect
			.element(screen.getByRole('group', { name: 'Birth month and year' }))
			.toHaveAccessibleDescription('We only ask for the month and year.');
		await expect.element(screen.getByRole('radiogroup', { name: 'Gender' })).toBeVisible();
	});

	it('offers the twelve months by name, with numbers as values', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
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

	it('asks for the month and year when they are empty, and moves focus to the month', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', { month: '', year: '' });
		await submitForm(screen);

		await expect.element(screen.getByText('Enter your birth month.')).toBeVisible();
		await expect.element(screen.getByText('Enter your birth year.')).toBeVisible();
		const month = screen.getByLabelText('Month');
		await expect.element(month).toHaveAttribute('aria-invalid', 'true');
		await expect.element(month).toHaveAttribute('aria-describedby', 'signup-birth_month-error');
		await expect.element(screen.getByLabelText('Year')).toHaveAttribute('aria-invalid', 'true');
		await expect.element(month).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it.each([
		['abcd', 'Enter your birth year.'],
		['1899', 'Enter a birth year of 1900 or later.'],
		[String(new Date().getFullYear() + 1), 'Enter a birth year that has passed.']
	])('refuses the year %j on the year field', async (year, message) => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', { year });
		await submitForm(screen);

		await expect.element(screen.getByText(message)).toBeVisible();
		const field = screen.getByLabelText('Year');
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(field).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('sends a recent birth year: the backend decides the minimum age', async () => {
		mockedSignup.mockResolvedValue({ status: 'pending_verification' });
		const year = new Date().getFullYear() - 5;
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', {
			month: '1',
			year: String(year),
			gender: 'Woman'
		});
		await submitForm(screen);

		await expect.poll(() => mockedSignup.mock.calls.length).toBe(1);
		expect(mockedSignup.mock.calls[0]?.[0]).toMatchObject({
			birth_month: 1,
			birth_year: year,
			gender_division: 'womens'
		});
	});

	it('never names an age limit', async () => {
		await render(SignupForm, { onsuccess: vi.fn() });
		expect(document.body.textContent).not.toContain('13');
	});

	it('puts the backend birth year message on the year field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { birth_year: ['Enter a birth year of 1900 or later.'] } })
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await submitForm(screen);

		await expect.element(screen.getByText('Enter a birth year of 1900 or later.')).toBeVisible();
		const year = screen.getByLabelText('Year');
		await expect.element(year).toHaveAttribute('aria-invalid', 'true');
		await expect.element(year).toHaveFocus();
		// The message is on the field, not in the form alert.
		expect(document.querySelector('[data-slot="alert"]')).toBeNull();
	});

	it('shows the refusal as the form alert, and nothing more', async () => {
		const message = "We can't create an account with these details.";
		mockedSignup.mockRejectedValue(appError({ code: 'signup_refused', message, fields: {} }));
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await submitForm(screen);

		const alert = screen.getByRole('alert');
		await expect.element(alert).toHaveTextContent(message);
		expect(alert.element().textContent?.trim()).toBe(message);
		expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Check your email' }))
			.not.toBeInTheDocument();
	});

	it('asks for man or woman when neither is chosen', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', { gender: null });
		await submitForm(screen);

		await expect.element(screen.getByText('Choose man or woman.')).toBeVisible();
		const group = screen.getByRole('radiogroup', { name: 'Gender' });
		await expect.element(group).toHaveAttribute('aria-invalid', 'true');
		await expect.element(group).toHaveAccessibleDescription('Choose man or woman.');
		await expect.element(screen.getByRole('radio', { name: 'Man' })).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('puts the backend gender message on the gender field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { gender_division: ['Choose one of the listed options.'] } })
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await submitForm(screen);

		await expect
			.element(screen.getByRole('radiogroup', { name: 'Gender' }))
			.toHaveAccessibleDescription('Choose one of the listed options.');
	});

	it('says when the passwords do not match, and sends nothing', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', {
			confirm: 'a-long-enough-pas'
		});
		await submitForm(screen);

		await expect.element(screen.getByText("The passwords don't match.")).toBeVisible();
		const confirm = screen.getByLabelText('Confirm password');
		await expect.element(confirm).toHaveAttribute('aria-invalid', 'true');
		await expect.element(confirm).toHaveFocus();
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('gives the confirm field its own Show button', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		const confirm = screen.getByLabelText('Confirm password');
		await expect.element(confirm).toHaveAttribute('type', 'password');
		await screen.getByRole('button', { name: 'Show confirm password' }).click();
		await expect.element(confirm).toHaveAttribute('type', 'text');
		await expect
			.element(screen.getByLabelText('Password', { exact: true }))
			.toHaveAttribute('type', 'password');
	});
	it('marks the gender group as required', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await expect
			.element(screen.getByRole('radiogroup', { name: 'Gender' }))
			.toHaveAttribute('aria-required', 'true');
	});
	it.each([' 1990', '01990'])('reads a pasted year %j as 1990', async (year) => {
		mockedSignup.mockResolvedValue({ status: 'pending_verification' });
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass', { year });
		await submitForm(screen);

		await expect.poll(() => mockedSignup.mock.calls.length).toBe(1);
		expect(mockedSignup.mock.calls[0]?.[0]).toMatchObject({ birth_year: 1990 });
	});
});
