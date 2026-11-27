import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { HomeView } from '#lib/features/matches/index.js';
import { myCode } from '#lib/features/players/index.js';
import './layout.css';
import Profile from './profile/+page.svelte';

// A name with no spaces must break inside the column, so the page never scrolls sideways
// (frontend#87). The data calls fail here: only the name line is under test.
vi.mock('$app/env/public', () => ({ PUBLIC_API_MOCK: 'off' }));
const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }));
vi.stubGlobal('fetch', fetchMock);

const PHONE = 320;
const NAME = 'W'.repeat(300);
const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

/** `GET me/player` answers with the long name, as the Profile gate asks for it again. */
function answerMyPlayer() {
	fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
		const url = input instanceof Request ? input.url : String(input);
		if (!url.endsWith('/api/v1/me/player')) return new Response('{}', { status: 500 });
		return Response.json({ code: CODE, display_name: NAME });
	});
}

beforeEach(() => {
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = CODE;
	myCode.status = 'ready';
});

afterEach(() => {
	session.reset();
	fetchMock.mockReset();
	fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
});

function expectInsideColumn(column: HTMLElement, line: HTMLElement) {
	expect(line.scrollWidth).toBeLessThanOrEqual(PHONE);
	expect(column.scrollWidth).toBeLessThanOrEqual(PHONE);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
		document.documentElement.clientWidth
	);
}

describe('long names', () => {
	it('break inside the column in the home greeting', async () => {
		myCode.displayName = NAME;
		const { container } = await render(HomeView);
		const column = container as HTMLElement;
		column.style.width = `${PHONE}px`;
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		const heading = column.querySelector('h1') as HTMLElement;
		expect(heading.textContent).toBe(`Hi, ${NAME}`);
		expectInsideColumn(column, heading);
	});

	it('break inside the column in the Profile Name row, with no name line under the title', async () => {
		myCode.displayName = NAME;
		answerMyPlayer();
		const { container } = await render(Profile);
		const column = container as HTMLElement;
		column.style.width = `${PHONE}px`;
		await expect.element(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
		expect(column.querySelector('h1 + p')).toBeNull();
		await expect.element(page.getByTestId('profile-name')).toBeVisible();
		const row = column.querySelector('[data-testid="profile-name"]') as HTMLElement;
		expect(row.textContent).toContain(NAME);
		expectInsideColumn(column, row);
	});
});
