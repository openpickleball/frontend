/**
 * Review finding C (frontend#261): a confirm settled whatever request was open when its answer
 * came back. After Cancel and a new request, a late answer confirmed the new request (or put its
 * error there), and "Checking…" stayed on the new request's button.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { reauthPrompt, requestReauth } from '../reauth.svelte.js';
import { reauthenticate } from '../services.js';
import ReauthPrompt from './reauth-prompt.svelte';

vi.mock('../services.js', () => ({ reauthenticate: vi.fn(), reauthenticateMfa: vi.fn() }));
const mocked = vi.mocked(reauthenticate);

afterEach(() => {
	reauthPrompt.settle(false);
	mocked.mockReset();
});

/** A reauthentication that answers only when the test says so. */
function slowAnswer() {
	let resolve: () => void = () => {};
	let reject: (error: unknown) => void = () => {};
	mocked.mockReturnValueOnce(
		new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		})
	);
	return { resolve: () => resolve(), reject: (error: unknown) => reject(error) };
}

async function confirmThenCancel(screen: Awaited<ReturnType<typeof render>>) {
	const first = requestReauth(['password']);
	await screen.getByLabelText('Password', { exact: true }).fill('first-try');
	await screen.getByRole('button', { name: /Checking|Confirm/ }).click();
	await screen.getByRole('button', { name: 'Cancel' }).click();
	expect(await first).toBe(false);
}

describe('ReauthPrompt and a late answer', () => {
	it('does not confirm a newer request with an older answer', async () => {
		const late = slowAnswer();
		const screen = await render(ReauthPrompt);
		await confirmThenCancel(screen);
		const second = requestReauth(['password']);
		let settled = false;
		void second.then(() => (settled = true));
		await expect.element(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
		late.resolve();
		await new Promise((r) => setTimeout(r, 50));
		expect(settled).toBe(false);
		expect(reauthPrompt.request).not.toBeNull();
		await expect.element(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
	});

	it('does not show an older error on a newer request', async () => {
		const late = slowAnswer();
		const screen = await render(ReauthPrompt);
		await confirmThenCancel(screen);
		void requestReauth(['password']);
		late.reject(
			new AppError({
				kind: 'validation',
				status: 400,
				code: 'incorrect_password',
				message: 'Incorrect password.',
				fields: { password: ['Incorrect password.'] }
			})
		);
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.getByText('Incorrect password.').query()).toBeNull();
	});
});
