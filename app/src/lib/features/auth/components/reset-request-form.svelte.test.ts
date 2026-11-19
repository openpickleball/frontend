import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AppError } from '#lib/api/index.js';
import { requestPasswordReset } from '../services.js';
import ResetRequestForm from './reset-request-form.svelte';

vi.mock('../services.js', () => ({ requestPasswordReset: vi.fn() }));
const mockedRequest = vi.mocked(requestPasswordReset);

function appError(overrides: Partial<AppError>): AppError {
	return {
		kind: 'validation',
		status: 400,
		code: 'error',
		message: 'Something went wrong.',
		fields: {},
		...overrides
	};
}

afterEach(() => mockedRequest.mockReset());

describe('ResetRequestForm', () => {
	it('checks the email before it asks the backend', async () => {
		const screen = await render(ResetRequestForm);
		await screen.getByLabelText('Email').fill('nope');
		await screen.getByRole('button', { name: 'Send reset link' }).click();

		const email = screen.getByLabelText('Email');
		await expect.element(email).toHaveAttribute('aria-invalid', 'true');
		await expect.element(email).toHaveAttribute('aria-describedby', 'reset-email-error');
		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		expect(mockedRequest).not.toHaveBeenCalled();
	});

	it('says to check your email, with the address, and moves focus to the heading', async () => {
		mockedRequest.mockResolvedValue(undefined);
		const screen = await render(ResetRequestForm);
		await screen.getByLabelText('Email').fill('Tamsin.Vale@Example.com');
		await screen.getByRole('button', { name: 'Send reset link' }).click();

		const heading = screen.getByRole('heading', { level: 1, name: 'Check your email' });
		await expect.element(heading).toBeVisible();
		await expect.element(heading).toHaveFocus();
		await expect.element(screen.getByText('tamsin.vale@example.com')).toBeVisible();
		expect(mockedRequest).toHaveBeenCalledWith('tamsin.vale@example.com');
	});

	it('shows the pending state while it waits', async () => {
		let finish: () => void = () => {};
		mockedRequest.mockReturnValue(new Promise((resolve) => (finish = () => resolve())));
		const screen = await render(ResetRequestForm);
		await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
		await screen.getByRole('button', { name: 'Send reset link' }).click();

		const busy = screen.getByRole('button', { name: 'Sending...' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish();
		await expect.element(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
	});

	it('puts a backend email message next to the field', async () => {
		mockedRequest.mockRejectedValue(appError({ fields: { email: ['Enter a valid email.'] } }));
		const screen = await render(ResetRequestForm);
		await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
		await screen.getByRole('button', { name: 'Send reset link' }).click();

		await expect.element(screen.getByText('Enter a valid email.')).toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
	});

	it('shows the error message for a throttle or any other failure above the form', async () => {
		mockedRequest.mockRejectedValue(
			appError({
				kind: 'server',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.',
				fields: { email: ['ignored'] }
			})
		);
		const screen = await render(ResetRequestForm);
		await screen.getByLabelText('Email').fill('tamsin.vale@example.com');
		await screen.getByRole('button', { name: 'Send reset link' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText('Too many attempts. Wait a moment and try again.'))
			.toBeVisible();
		await expect.element(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
	});
});
