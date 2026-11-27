/**
 * Defect F6: a page past the end (the last row of a later page deleted, or an old `?page=9`
 * link) said "No Events yet" though the account has Events.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { session } from '#lib/features/auth/index.js';
import * as services from '../services.js';
import { LIST_EMPTY_TITLE } from '../copy.js';
import OrganizerEvents from './organizer-events.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	listOrganizerEvents: vi.fn()
}));
const mocked = vi.mocked(services);

beforeEach(() => {
	vi.resetAllMocks();
	session.apply({ status: 'signed_in', email: 'manager@example.com' });
	session.organizers = [];
});
afterEach(() => session.reset());

it('says the page is past the end, and links back to the newest', async () => {
	mocked.listOrganizerEvents.mockResolvedValue({ items: [], count: 5 });
	await render(OrganizerEvents, { page: 9 });
	await expect
		.element(page.getByRole('heading', { name: 'There are no Events on this page' }))
		.toBeVisible();
	await expect.element(page.getByText(LIST_EMPTY_TITLE)).not.toBeInTheDocument();
	await expect
		.element(page.getByRole('link', { name: 'Back to the newest' }))
		.toHaveAttribute('href', '/organizer?page=1');
});
