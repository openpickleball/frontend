import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { session } from '#lib/features/auth/index.js';
import ProfilePage from './+page.svelte';
import TwoFactorPage from './two-factor/+page.svelte';

const MEMBERSHIP = {
	organizer: 'G-K7MQ-2RD4',
	name: 'Larkspur Paddle League',
	role: 'admin',
	verified: true
} as const;

const pages = [
	['the profile page', ProfilePage],
	['the two-factor page', TwoFactorPage]
] as const;

afterEach(() => session.reset());

describe('organizer wording on the profile and two-factor pages', () => {
	it.each(pages)('says nothing about organizers on %s to a non-member', (_, page) => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		session.organizers = [];
		session.mfaEnrolled = false;
		const { body } = render(page);
		expect(body).not.toMatch(/organizer/i);
	});

	it.each(pages)('prompts an organizer member without two-factor on %s', (_, page) => {
		session.apply({ status: 'signed_in', email: 'organizer@example.com' });
		session.organizers = [{ ...MEMBERSHIP }];
		session.mfaEnrolled = false;
		const { body } = render(page);
		expect(body).toContain('Organizer actions need two-factor authentication.');
	});
});
