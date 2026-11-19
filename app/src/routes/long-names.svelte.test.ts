import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { HomeView } from '#lib/features/matches/index.js';
import { myCode } from '#lib/features/players/index.js';
import './layout.css';
import Profile from './profile/+page.svelte';

// A name or email with no spaces must break inside the column, so the page never scrolls sideways
// (frontend#87). The data calls fail here: only the name line is under test.
vi.mock('$app/env/public', () => ({ PUBLIC_API_MOCK: 'off' }));
vi.stubGlobal(
	'fetch',
	vi.fn(async () => new Response('{}', { status: 500 }))
);

const PHONE = 320;
const NAME = 'W'.repeat(300);
const EMAIL = `${'w'.repeat(200)}@example.com`;

beforeEach(() => {
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.save(buildCode('player', '4RWN8TQ') as PlayerCode);
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

	it.each([
		['display name', NAME, null],
		['email', null, EMAIL]
	])('break inside the column in the profile %s', async (_label, name, email) => {
		myCode.displayName = name;
		myCode.email = email;
		const { container } = await render(Profile);
		const column = container as HTMLElement;
		column.style.width = `${PHONE}px`;
		await expect.element(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
		const line = column.querySelector('h1 + p') as HTMLElement;
		expect(line.textContent).toBe(name ?? email);
		expectInsideColumn(column, line);
	});
});
