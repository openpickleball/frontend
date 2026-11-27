/**
 * `/organizer` is for organizer members only. Its load waits for the memberships, so a member
 * who just signed in gets the page, and a player who is not a member gets the app's not found
 * page with no request to the Event operations.
 */
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LARKSPUR, MOCK_PASSWORD, ORGANIZER_EMAIL, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';

// The app-wide client, against the mocks with a cookie jar, as in a browser.
vi.mock('#lib/api/index.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	api: (await import('#lib/mocks/node.js')).cookieJarApi()
}));

useMockApi();

let paths: string[] = [];
server.events.on('request:start', ({ request }) => {
	paths.push(new URL(request.url).pathname);
});

/** A fresh app, as after a page load: no session read yet. */
async function freshLoad(search = '') {
	vi.resetModules();
	const { load } = await import('./+page');
	const url = new URL(`http://localhost/organizer${search}`);
	type LoadEvent = Parameters<typeof load>[0];
	return load({ url } as LoadEvent);
}

async function outcome(search = '') {
	return freshLoad(search).catch((thrown: unknown) => thrown);
}

// The first import transforms the page's whole module graph, which can be slow on a busy run.
// Later fresh imports run the cached modules again.
beforeAll(async () => {
	await import('./+page');
}, 30_000);

beforeEach(() => {
	paths = [];
});

describe('/organizer load', () => {
	it('sends a signed-out visit to sign in, and back', async () => {
		const thrown = await outcome();
		expect(isRedirect(thrown) && thrown.location).toBe('/account/login?next=%2Forganizer');
	});

	it('is not found for a signed-in player who is not a member, with no Event request', async () => {
		mockStore.login(VERIFIED_EMAIL, MOCK_PASSWORD);
		const thrown = await outcome();
		expect(isHttpError(thrown, 404)).toBe(true);
		expect(paths).toContain('/api/v1/organizer/organizers');
		expect(paths.filter((p) => p.startsWith('/api/v1/organizer/events'))).toEqual([]);
		expect(paths.filter((p) => p.includes('club-grants'))).toEqual([]);
	});

	it('gives a member the page right after the session is read', async () => {
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		expect(await outcome()).toEqual({ page: 1 });
	});

	it('reads the page number from the address', async () => {
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		expect(await outcome('?page=3')).toEqual({ page: 3 });
	});

	it('is not found once the membership is gone, on the next page load', async () => {
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		expect(await outcome()).toEqual({ page: 1 });
		mockStore.removeMembership(ORGANIZER_EMAIL, LARKSPUR);
		expect(isHttpError(await outcome(), 404)).toBe(true);
	});
});
