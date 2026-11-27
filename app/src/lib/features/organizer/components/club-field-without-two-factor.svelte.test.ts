/**
 * Defect F1: the club field read `club-grants` for every admin. Without two-factor that read is
 * always 403 `mfa_required`, which also fires the app-wide toast as the dialog opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import ClubField from './club-field.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listClubGrants: vi.fn()
}));
const mocked = vi.mocked(services);

beforeEach(() => {
	vi.resetAllMocks();
	mocked.listClubGrants.mockResolvedValue([]);
	session.apply({ status: 'signed_in', email: 'organizer@example.com' });
});
afterEach(() => session.reset());

describe('ClubField for an admin', () => {
	it('asks for a code and reads no grants when two-factor is off', async () => {
		session.mfaEnrolled = false;
		await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: true });
		await expect.element(page.getByRole('textbox', { name: 'Club code' })).toBeVisible();
		expect(mocked.listClubGrants).not.toHaveBeenCalled();
	});

	it.each([null, true])('reads the grants when two-factor is %s', async (enrolled) => {
		session.mfaEnrolled = enrolled;
		await render(ClubField, { organizer: 'G-K7MQ-2RD4', admin: true });
		await vi.waitFor(() => expect(mocked.listClubGrants).toHaveBeenCalledWith('G-K7MQ-2RD4'));
	});
});
