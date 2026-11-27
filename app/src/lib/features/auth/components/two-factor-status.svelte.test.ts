import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session } from '../session.svelte.js';
import TwoFactorStatus from './two-factor-status.svelte';

afterEach(() => session.reset());

describe('TwoFactorStatus', () => {
	it('says two-factor is off and links to its page', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		session.mfaEnrolled = false;
		const screen = await render(TwoFactorStatus);
		await expect
			.element(screen.getByRole('heading', { name: 'Two-factor authentication' }))
			.toBeVisible();
		await expect.element(screen.getByText('Off.', { exact: false })).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Set up two-factor' }))
			.toHaveAttribute('href', '/profile/two-factor');
	});

	it('says two-factor is on', async () => {
		session.apply({ status: 'signed_in', email: 'twofactor@example.com' });
		session.mfaEnrolled = true;
		const screen = await render(TwoFactorStatus);
		await expect.element(screen.getByText('On.', { exact: false })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Manage two-factor' })).toBeVisible();
	});

	it('still links to the page while the status is unknown', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const screen = await render(TwoFactorStatus);
		await expect.element(screen.getByRole('link', { name: 'Two-factor settings' })).toBeVisible();
	});
});
