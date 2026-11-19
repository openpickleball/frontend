import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import type { SearchFn, SearchResult } from '../search.js';
import PlayerSlot from './player-slot.svelte';

function code(key: string): PlayerCode {
	const parsed = parsePlayerCode(PLAYERS.find((p) => p.key === key)!.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}

const two: SearchResult = {
	ok: true,
	items: [
		{ code: code('bea'), name: 'Bea Marlowe' },
		{ code: code('rosa'), name: 'Rosa Fenwick' }
	]
};

async function setup(answer: SearchResult | Promise<SearchResult> = two, exclude: string[] = []) {
	const search = vi.fn<SearchFn>().mockImplementation(async () => answer);
	const onpick = vi.fn();
	const oncommit = vi.fn();
	const screen = await render(PlayerSlot, {
		id: 'partner',
		label: "Your partner's OPEN code",
		code: null,
		exclude,
		search,
		onpick,
		oncommit,
		onremove: () => {}
	});
	const box = screen.getByRole('combobox', { name: "Your partner's OPEN code" });
	return { screen, search, onpick, oncommit, box };
}

describe('PlayerSlot search', () => {
	it('is a combobox that stays closed until there are results', async () => {
		const { box } = await setup();
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
		await expect.element(box).toHaveAttribute('aria-autocomplete', 'list');
		await expect.element(box).not.toHaveAttribute('aria-activedescendant');
	});

	it('does not search for fewer than 3 characters', async () => {
		const { box, search } = await setup();
		await box.fill('be');
		await new Promise((r) => setTimeout(r, 400));
		expect(search).not.toHaveBeenCalled();
	});

	it('lists the players found and announces how many', async () => {
		const { screen, box, search } = await setup();
		await box.fill('mar');
		await expect.element(screen.getByRole('option', { name: /Bea Marlowe/ })).toBeVisible();
		expect(search).toHaveBeenCalledTimes(1);
		expect(search.mock.calls[0][0]).toBe('mar');
		await expect.element(box).toHaveAttribute('aria-expanded', 'true');
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent('2 players found. Use the up and down arrow keys to choose.');
		// Each option shows the name and the code.
		await expect
			.poll(() => screen.getByRole('option').first().element().textContent)
			.toContain(code('bea'));
	});

	it('moves through the options with the arrow keys and picks with Enter', async () => {
		const { screen, box, onpick, oncommit } = await setup();
		await box.fill('mar');
		await expect.element(screen.getByRole('option').first()).toBeVisible();

		await userEvent.keyboard('{ArrowDown}');
		const first = screen.getByRole('option').first();
		await expect.element(first).toHaveAttribute('aria-selected', 'true');
		const firstId = first.element().id;
		await expect.element(box).toHaveAttribute('aria-activedescendant', firstId);

		await userEvent.keyboard('{ArrowDown}');
		await expect.element(first).toHaveAttribute('aria-selected', 'false');
		await userEvent.keyboard('{ArrowUp}{ArrowUp}');
		// Past the first option it wraps to the last.
		await expect
			.element(screen.getByRole('option').nth(1))
			.toHaveAttribute('aria-selected', 'true');

		await userEvent.keyboard('{Enter}');
		expect(onpick).toHaveBeenCalledWith({ code: code('rosa'), name: 'Rosa Fenwick' });
		expect(oncommit).not.toHaveBeenCalled();
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
	});

	it('picks an option with the pointer, keeping focus in the box', async () => {
		const { screen, box, onpick } = await setup();
		await box.fill('mar');
		await screen.getByRole('option', { name: /Bea Marlowe/ }).click();
		expect(onpick).toHaveBeenCalledWith({ code: code('bea'), name: 'Bea Marlowe' });
		await expect.element(box).toHaveFocus();
	});

	it('closes on Escape without clearing the text, and opens again on typing', async () => {
		const { screen, box } = await setup();
		await box.fill('mar');
		await expect.element(screen.getByRole('option').first()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
		await expect.element(box).toHaveValue('mar');
		await userEvent.keyboard('l');
		await expect.element(box).toHaveAttribute('aria-expanded', 'true');
	});

	it('Enter with the list closed checks the typed code, as before', async () => {
		const { screen, box, oncommit, onpick } = await setup();
		await box.fill('mar');
		await expect.element(screen.getByRole('option').first()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await userEvent.keyboard('{Enter}');
		expect(oncommit).toHaveBeenCalledTimes(1);
		expect(onpick).not.toHaveBeenCalled();
	});

	it('does not search for a complete code', async () => {
		const { box, search } = await setup();
		await box.fill(code('bea'));
		await new Promise((r) => setTimeout(r, 400));
		expect(search).not.toHaveBeenCalled();
	});

	it('leaves out players who are already in the match', async () => {
		const { screen, box } = await setup(two, [code('bea')]);
		await box.fill('mar');
		await expect
			.poll(() => screen.getByRole('option').element().textContent)
			.toContain('Rosa Fenwick');
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent('1 player found. Use the up and down arrow keys to choose.');
	});

	it('says when no one was found', async () => {
		const { screen, box } = await setup({ ok: true, items: [] });
		await box.fill('zzz');
		const message = 'No players found. Check the spelling or enter their OPEN code.';
		await expect.element(screen.getByTestId('search-note')).toHaveTextContent(message);
		await expect.element(screen.getByRole('status')).toHaveTextContent(message);
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
	});

	it('says when there are too many searches', async () => {
		const { screen, box } = await setup({ ok: false, kind: 'throttled', retryAfter: null });
		await box.fill('mar');
		await expect
			.element(screen.getByTestId('search-note'))
			.toHaveTextContent('Too many searches. Try again in a minute.');
	});

	it('says plainly when the search failed', async () => {
		const { screen, box } = await setup({ ok: false, kind: 'other', retryAfter: null });
		await box.fill('mar');
		await expect
			.element(screen.getByTestId('search-note'))
			.toHaveTextContent('We could not search just now. Try again, or enter their OPEN code.');
	});

	it('shows the name beside the code once a player is picked', async () => {
		const screen = await render(PlayerSlot, {
			id: 'partner',
			label: "Your partner's OPEN code",
			code: code('bea'),
			name: 'Bea Marlowe',
			oncommit: () => {},
			onremove: () => {}
		});
		await expect.element(screen.getByTestId('chip')).toHaveTextContent(code('bea'));
		await expect.element(screen.getByTestId('chip-name')).toHaveTextContent('Bea Marlowe');
		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('bea')}` }))
			.toBeVisible();
	});
});
