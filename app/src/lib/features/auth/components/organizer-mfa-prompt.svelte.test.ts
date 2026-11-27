import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session, type OrganizerMembership } from '../session.svelte.js';
import OrganizerMfaPrompt from './organizer-mfa-prompt.svelte';

const MEMBERSHIP: OrganizerMembership = {
	organizer: 'G-K7MQ-2RD4',
	name: 'Larkspur Paddle League',
	role: 'admin',
	verified: true
};

function signedIn(organizers: OrganizerMembership[] | null, mfaEnrolled: boolean | null) {
	session.apply({ status: 'signed_in', email: 'organizer@example.com' });
	session.organizers = organizers;
	session.mfaEnrolled = mfaEnrolled;
}

afterEach(() => session.reset());

describe('OrganizerMfaPrompt', () => {
	it('tells an organizer member without two-factor that organizer actions need it', async () => {
		signedIn([MEMBERSHIP], false);
		const screen = await render(OrganizerMfaPrompt, { link: true });
		await expect
			.element(screen.getByText('Organizer actions need two-factor authentication.'))
			.toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Set up two-factor' }))
			.toHaveAttribute('href', '/profile/two-factor');
	});

	it('leaves the link out on the two-factor page itself', async () => {
		signedIn([MEMBERSHIP], false);
		const screen = await render(OrganizerMfaPrompt);
		await expect
			.element(screen.getByText('Organizer actions need two-factor authentication.'))
			.toBeVisible();
		expect(screen.getByRole('link').query()).toBeNull();
	});

	it.each([
		['a non-member', [], false],
		['an account whose memberships are still loading', null, false],
		['a member with two-factor on', [MEMBERSHIP], true],
		['a member whose two-factor is unknown', [MEMBERSHIP], null]
	] as const)('renders nothing for %s', async (_, organizers, enrolled) => {
		signedIn(organizers === null ? null : [...organizers], enrolled);
		const screen = await render(OrganizerMfaPrompt, { link: true });
		expect(screen.container.textContent?.trim()).toBe('');
	});
});
