/**
 * Review finding V4 (frontend#261): the organizer notice inside the profile's two-factor section
 * had 16px below it. app/AGENTS.md puts 8 (32px) between notices and blocks inside a section.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../../routes/layout.css'; // eslint-disable-line boundaries/dependencies -- a layout test needs the app styles
import { session } from '../session.svelte.js';
import TwoFactorStatus from './two-factor-status.svelte';

afterEach(() => session.reset());

describe('TwoFactorStatus with the organizer notice', () => {
	it('puts 32px between the notice and the status line', async () => {
		session.apply({ status: 'signed_in', email: 'organizer@example.com' });
		session.organizers = [
			{
				organizer: 'G-K7MQ-2RD4',
				name: 'Larkspur Paddle League',
				role: 'admin',
				verified: true,
				verification_requested: false
			}
		];
		session.mfaEnrolled = false;
		const screen = await render(TwoFactorStatus);
		const notice = screen.getByRole('status').or(screen.getByRole('alert')).first();
		const line = screen.getByText(/^Off\./);
		await expect.element(line).toBeVisible();
		const gap =
			line.element().getBoundingClientRect().top - notice.element().getBoundingClientRect().bottom;
		expect(gap).toBe(32);
	});
});
