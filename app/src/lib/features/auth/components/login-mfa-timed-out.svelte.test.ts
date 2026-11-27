/** Review finding L (frontend#261): the sign-in form says why the code step went away. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session } from '../session.svelte.js';
import LoginForm from './login-form.svelte';

vi.mock('../services.js', () => ({ login: vi.fn(), authenticateMfa: vi.fn(), cancelMfa: vi.fn() }));

afterEach(() => session.reset());

describe('LoginForm after the two-factor step ran out', () => {
	it('says it took too long, above the password form', async () => {
		session.apply({ status: 'signed_out' });
		session.mfaTimedOut = true;
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByText('That took too long. Sign in again.')).toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toBeVisible();
	});

	it('says nothing on a plain visit', async () => {
		session.apply({ status: 'signed_out' });
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByLabelText('Email')).toBeVisible();
		expect(screen.getByText('That took too long. Sign in again.').query()).toBeNull();
	});
});
