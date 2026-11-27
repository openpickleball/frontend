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
vi.stubGlobal(
	'fetch',
	vi.fn(async () => new Response('{}', { status: 500 }))
);

const PHONE = 320;
const NAME = 'W'.repeat(300);

beforeEach(() => {
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = buildCode('player', '4RWN8TQ') as PlayerCode;
	myCode.status = 'ready';
});

afterEach(() => {
	session.reset();
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

	it('never push the profile sideways, which has no name line under its title', async () => {
		myCode.displayName = NAME;
		const { container } = await render(Profile);
		const column = container as HTMLElement;
		column.style.width = `${PHONE}px`;
		await expect.element(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
		// The display name field shows the name, once the settings load.
		expect(column.querySelector('h1 + p')).toBeNull();
		expect(column.textContent).not.toContain(NAME);
		expectInsideColumn(column, column);
	});
});
