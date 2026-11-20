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
		label: 'Your partner: name or OPEN code',
		code: null,
		exclude,
		search,
		onpick,
		oncommit,
		onremove: () => {}
	});
	const box = screen.getByRole('combobox', { name: 'Your partner: name or OPEN code' });
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
			.toHaveTextContent(
				'2 players found, starting with Bea Marlowe. Use the up and down arrow keys to choose, then Enter.'
			);
		// Each option shows the name and the code.
		await expect
			.poll(() => screen.getByRole('option').first().element().textContent)
			.toContain(code('bea'));
	});

	it('highlights the first option, moves with the arrow keys and picks with Enter', async () => {
		const { screen, box, onpick, oncommit } = await setup();
		await box.fill('mar');
		const first = screen.getByRole('option').first();
		const second = screen.getByRole('option').nth(1);
		await expect.element(first).toBeVisible();
		// The first option is highlighted as soon as the list opens.
		await expect.element(first).toHaveAttribute('data-highlighted');
		await expect.element(box).toHaveAttribute('aria-activedescendant', first.element().id);

		await userEvent.keyboard('{ArrowDown}');
		await expect.element(second).toHaveAttribute('data-highlighted');
		await expect.element(box).toHaveAttribute('aria-activedescendant', second.element().id);
		await userEvent.keyboard('{ArrowUp}{ArrowDown}');
		await expect.element(second).toHaveAttribute('data-highlighted');

		await userEvent.keyboard('{Enter}');
		expect(onpick).toHaveBeenCalledWith({ code: code('rosa'), name: 'Rosa Fenwick' });
		expect(oncommit).not.toHaveBeenCalled();
		await expect.element(box).toHaveAttribute('aria-expanded', 'false');
	});

	it('picks the only result with Enter, without the arrow keys', async () => {
		const { box, onpick, oncommit, screen } = await setup({
			ok: true,
			items: [{ code: code('bea'), name: 'Bea Marlowe' }]
		});
		await box.fill('bea marlowe');
		await expect.element(screen.getByRole('option')).toBeVisible();
		await userEvent.keyboard('{Enter}');
		expect(onpick).toHaveBeenCalledWith({ code: code('bea'), name: 'Bea Marlowe' });
		expect(oncommit).not.toHaveBeenCalled();
	});

	it('picks an option with the pointer', async () => {
		const { screen, box, onpick } = await setup();
		await box.fill('mar');
		await screen.getByRole('option', { name: /Bea Marlowe/ }).click();
		expect(onpick).toHaveBeenCalledWith({ code: code('bea'), name: 'Bea Marlowe' });
	});

	it('keeps focus in the box when the list padding is pressed', async () => {
		const { screen, box, oncommit } = await setup();
		await box.fill('mar');
		await expect.element(screen.getByRole('option').first()).toBeVisible();
		const list = screen.getByRole('listbox').element();
		const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		list.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		await expect.element(box).toHaveFocus();
		expect(oncommit).not.toHaveBeenCalled();
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

	it('says so when every player found is already in the match', async () => {
		const { screen, box } = await setup(two, [code('bea'), code('rosa')]);
		await box.fill('mar');
		const message = 'Those players are already in this match.';
		await expect.element(screen.getByTestId('search-note')).toHaveTextContent(message);
		await expect.element(screen.getByRole('status')).toHaveTextContent(message);
	});

	it('searches names that look a little like a code', async () => {
		const { box, search } = await setup();
		await box.fill('P Smith');
		await expect.poll(() => search.mock.calls.length).toBe(1);
		expect(search.mock.calls[0][0]).toBe('P Smith');
	});

	it('leaves out players who are already in the match', async () => {
		const { screen, box } = await setup(two, [code('bea')]);
		await box.fill('mar');
		await expect
			.poll(() => screen.getByRole('option').element().textContent)
			.toContain('Rosa Fenwick');
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent(
				'1 player found, starting with Rosa Fenwick. Use the up and down arrow keys to choose, then Enter.'
			);
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
			.toHaveTextContent("We couldn't search just now. Try again, or enter their OPEN code.");
	});

	it('leads the chip with the name, keeps the code on one line, and names the player to remove', async () => {
		const long = 'Bartholomew Fitzgerald-Montgomery Abernathy-Whitcombe of Lower Puddleton on Sea';
		const screen = await render(PlayerSlot, {
			id: 'partner',
			label: 'Your partner: name or OPEN code',
			code: code('bea'),
			name: long,
			oncommit: () => {},
			onremove: () => {}
		});
		await expect.element(screen.getByTestId('chip')).toHaveTextContent(code('bea'));
		await expect.element(screen.getByTestId('chip-name')).toHaveTextContent(long);
		// The name comes first.
		const name = screen.getByTestId('chip-name').element();
		const chip = screen.getByTestId('chip').element();
		expect(name.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		// The code stays on one line, however long the name. (The e2e test checks the layout.)
		expect(chip.classList).toContain('whitespace-nowrap');
		await expect.element(screen.getByRole('button', { name: `Remove ${long}` })).toBeVisible();
	});

	it('names a typed code on its remove button', async () => {
		const screen = await render(PlayerSlot, {
			id: 'partner',
			label: 'Your partner: name or OPEN code',
			code: code('bea'),
			oncommit: () => {},
			onremove: () => {}
		});
		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('bea')}` }))
			.toBeVisible();
	});

	it('does not search for part of a code', async () => {
		const { box, search } = await setup();
		await box.fill('P-M2CF');
		await box.fill('4rwn8');
		await new Promise((r) => setTimeout(r, 400));
		expect(search).not.toHaveBeenCalled();
	});

	it('changes what is announced when a new search returns the same count', async () => {
		const answers: SearchResult[] = [
			{ ok: true, items: [{ code: code('bea'), name: 'Bea Marlowe' }] },
			{ ok: true, items: [{ code: code('rosa'), name: 'Rosa Fenwick' }] }
		];
		const search = vi.fn<SearchFn>().mockImplementation(async () => answers.shift()!);
		const screen = await render(PlayerSlot, {
			id: 'partner',
			label: 'Your partner: name or OPEN code',
			code: null,
			search,
			oncommit: () => {},
			onremove: () => {}
		});
		const box = screen.getByRole('combobox');
		await box.fill('bea');
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent(
				'1 player found, starting with Bea Marlowe. Use the up and down arrow keys to choose, then Enter.'
			);
		await box.fill('rosa');
		await expect
			.element(screen.getByRole('status'))
			.toHaveTextContent(
				'1 player found, starting with Rosa Fenwick. Use the up and down arrow keys to choose, then Enter.'
			);
	});
});
