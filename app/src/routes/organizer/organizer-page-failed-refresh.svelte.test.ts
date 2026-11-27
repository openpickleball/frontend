/**
 * Defect F13: after a refusal, the memberships are read again. When that read failed, the page's
 * effect ran the load again, the load retried the read, the retry failed and wrote a new empty
 * list, and the still-mounted page ran the load again: requests without end, and the not found
 * page never showed. The reads must stop, with the page settling on not found.
 */
import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { invalidateAll } from '$app/navigation';
import { loadAccountState, session } from '#lib/features/auth/index.js';
import { load } from './+page';
import Page from './+page.svelte';

let organizerReads = 0;

/** The backend for this test: signed in, and every memberships read fails. */
const fakeFetch: typeof fetch = async (input, init) => {
	const request = new Request(input, init);
	const path = new URL(request.url).pathname;
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	if (path === '/api/v1/organizer/organizers') {
		organizerReads += 1;
		return json({ code: 'error', message: 'x', errors: [] }, 500);
	}
	if (path.endsWith('/auth/session')) {
		return json({ status: 200, data: { user: { email: 'organizer@example.com' } }, meta: {} });
	}
	if (path.endsWith('/account/authenticators')) return json({ status: 200, data: [] });
	if (path === '/api/v1/organizer/events') return json({ items: [], count: 0 });
	return json({ status: 200, data: {} });
};

vi.mock('#lib/api/index.js', async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	const createApi = actual.createApi as (options: {
		fetch: typeof fetch;
		getCookies: () => string;
	}) => unknown;
	return {
		...actual,
		api: createApi({ fetch: (input, init) => fakeFetch(input, init), getCookies: () => '' })
	};
});

const outcomes: unknown[] = [];
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(async () => {
		try {
			outcomes.push(await load({ url: new URL('http://localhost/organizer') } as never));
		} catch (thrown) {
			outcomes.push(thrown);
		}
	}),
	goto: vi.fn()
}));

beforeEach(async () => {
	organizerReads = 0;
	outcomes.length = 0;
	vi.mocked(invalidateAll).mockClear();
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
});
afterEach(() => session.reset());

it('stops reading after a failed refresh and settles on not found', async () => {
	await render(Page, { data: { page: 1 }, params: {} } as never);
	// The refresh after a refusal, which fails.
	await loadAccountState();
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(organizerReads).toBeLessThanOrEqual(3);
	expect(vi.mocked(invalidateAll).mock.calls.length).toBeLessThanOrEqual(2);
	expect(outcomes.length).toBeGreaterThan(0);
	expect(isHttpError(outcomes.at(-1), 404)).toBe(true);
});
