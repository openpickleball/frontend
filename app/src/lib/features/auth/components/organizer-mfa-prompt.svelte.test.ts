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
		const screen = await render(OrganizerMfaPrompt);
		await expect
			.element(screen.getByText('Organizer actions need two-factor authentication.'))
			.toBeVisible();
		// The section or page around it has the way to set two-factor up.
		expect(screen.getByRole('link').query()).toBeNull();
	});

	it.each([
		['a non-member', [], false],
		['an account whose memberships are still loading', null, false],
		['a member with two-factor on', [MEMBERSHIP], true],
		['a member whose two-factor is unknown', [MEMBERSHIP], null]
	] as const)('renders nothing for %s', async (_, organizers, enrolled) => {
		signedIn(organizers === null ? null : [...organizers], enrolled);
		const screen = await render(OrganizerMfaPrompt);
		expect(screen.container.textContent?.trim()).toBe('');
	});
});
