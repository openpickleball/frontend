import { describe, expect, it, vi } from 'vitest';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { createAuthForm } from './form.svelte.js';

const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as SubmitEvent;

const ok = <T>(data: T) => ({ success: true as const, data });
const invalid = (field: string, message: string) => ({
	success: false as const,
	error: { issues: [{ path: [field], message }] }
});

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

describe('createAuthForm', () => {
	it('stops the browser submit and ignores a second submit while busy', async () => {
		const form = createAuthForm('t', ['email']);
		let finish: () => void = () => {};
		const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		const first = form.submit(submitEvent(), { parse: () => ok(1), run, onError: vi.fn() });
		expect(form.busy).toBe(true);

		const event = submitEvent();
		await form.submit(event, { parse: () => ok(1), run, onError: vi.fn() });
		expect(event.preventDefault).toHaveBeenCalled();
		expect(run).toHaveBeenCalledOnce();

		finish();
		await first;
		expect(form.busy).toBe(false);
	});

	it('shows the first message per field and does not call run when the fields are invalid', async () => {
		const form = createAuthForm('t', ['email']);
		const run = vi.fn();
		await form.submit(submitEvent(), {
			parse: () => invalid('email', 'Enter a valid email address.'),
			run,
			onError: vi.fn()
		});
		expect(form.errors).toEqual({ email: 'Enter a valid email address.' });
		expect(form.busy).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it('lets onInvalid take over the messages without moving focus', async () => {
		const input = document.createElement('input');
		input.id = 't-key';
		document.body.append(input);
		const form = createAuthForm('t', ['key']);
		await form.submit(submitEvent(), {
			parse: () => invalid('key', 'Bad key.'),
			onInvalid: () => true,
			run: vi.fn(),
			onError: vi.fn()
		});
		await Promise.resolve();
		expect(form.errors).toEqual({ key: 'Bad key.' });
		expect(document.activeElement).not.toBe(input);
		input.remove();
	});

	it('clears the last problem and errors before it runs', async () => {
		const form = createAuthForm('t', ['email']);
		form.problem = { title: 'Old problem.' };
		form.showFields({ email: 'Old.' });
		await form.submit(submitEvent(), { parse: () => ok(1), run: async () => {}, onError: vi.fn() });
		expect(form.problem).toBeNull();
		expect(form.errors).toEqual({});
	});

	it('hands a thrown AppError and its field messages to onError, and stops being busy', async () => {
		const form = createAuthForm('t', ['email']);
		const onError = vi.fn();
		const error = appError({ fields: { email: ['Taken.', 'Other.'] } });
		await form.submit(submitEvent(), {
			parse: () => ok(1),
			run: () => Promise.reject(error),
			onError
		});
		expect(onError).toHaveBeenCalledWith(error, { email: 'Taken.' });
		expect(form.busy).toBe(false);
	});

	it('turns something that is not an AppError into a plain server error', async () => {
		const form = createAuthForm('t', ['email']);
		const onError = vi.fn();
		await form.submit(submitEvent(), {
			parse: () => ok(1),
			run: () => Promise.reject(new Error('boom')),
			onError
		});
		expect(onError.mock.calls[0][0]).toMatchObject({
			kind: 'server',
			message: 'Something went wrong. Try again.'
		});
	});

	it('focuses the first field with a message, in the order given', async () => {
		const first = document.createElement('input');
		first.id = 't-email';
		const second = document.createElement('input');
		second.id = 't-password';
		document.body.append(first, second);
		const form = createAuthForm('t', ['email', 'password']);
		form.showFields({ password: 'Too short.', email: 'Invalid.' });
		await vi.waitFor(() => expect(document.activeElement).toBe(first));
		first.remove();
		second.remove();
	});
});
