import { describe, expect, it } from 'vitest';
import { parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import { createDraftStore, draftKey, isBlank, parseDraft, type Draft } from './draft.js';
import { RecordForm } from './form.svelte.js';

function code(key: string): PlayerCode {
	const parsed = parsePlayerCode(PLAYERS.find((p) => p.key === key)!.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}

function memory() {
	const items = new Map<string, string>();
	const store = createDraftStore(() => ({
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key)
	}));
	return { items, store };
}

const draft: Draft = {
	format: 'doubles',
	playedOn: '2026-05-01',
	gameTarget: 15,
	scoringType: 'rally',
	partner: { code: code('oren'), name: 'Oren' },
	opponents: [
		{ code: code('kit'), name: '' },
		{ code: null, name: '' }
	],
	games: [{ a: '11', b: '7' }]
};

describe('draft store', () => {
	it('reads back what it wrote, kept per own code', () => {
		const { store, items } = memory();
		store.write(code('tamsin'), draft);
		expect(store.read(code('tamsin'))).toEqual(draft);
		expect(store.read(code('oren'))).toBeNull();
		expect([...items.keys()]).toEqual([draftKey(code('tamsin'))]);
		store.clear(code('tamsin'));
		expect(store.read(code('tamsin'))).toBeNull();
	});

	it('ignores stored text that is not a draft', () => {
		const { store, items } = memory();
		const key = draftKey('x');
		for (const bad of ['not json', '{}', '[]', JSON.stringify({ ...draft, gameTarget: 9 })]) {
			items.set(key, bad);
			expect(store.read('x')).toBeNull();
		}
		expect(parseDraft({ ...draft, games: [] })).toBeNull();
		expect(parseDraft({ ...draft, partner: { code: 'nope', name: '' } })).toBeNull();
		expect(parseDraft({ ...draft, games: [{ a: 1, b: 2 }] })).toBeNull();
	});

	it('never throws when storage is missing or refuses', () => {
		const none = createDraftStore(() => null);
		none.write('x', draft);
		none.clear('x');
		expect(none.read('x')).toBeNull();

		const refuses = () => {
			throw new Error('blocked');
		};
		const full = createDraftStore(() => ({
			getItem: refuses,
			setItem: refuses,
			removeItem: refuses
		}));
		full.write('x', draft);
		full.clear('x');
		expect(full.read('x')).toBeNull();
	});
});

describe('isBlank', () => {
	it('is true for a fresh form and false once anything is entered', () => {
		const form = new RecordForm(code('tamsin'));
		const today = form.playedOn;
		expect(isBlank(form.draft, today)).toBe(true);
		form.games[0].a = '1';
		expect(isBlank(form.draft, today)).toBe(false);
	});
});

describe('RecordForm draft', () => {
	it('round-trips through restore', () => {
		const form = new RecordForm(code('tamsin'));
		form.restore(draft);
		expect(form.draft).toEqual(draft);
		expect(form.input.teamB).toEqual([code('kit')]);
	});

	it('leaves out the own code and repeated codes', () => {
		const form = new RecordForm(code('tamsin'));
		form.restore({
			...draft,
			partner: { code: code('tamsin'), name: '' },
			opponents: [
				{ code: code('kit'), name: '' },
				{ code: code('kit'), name: '' }
			]
		});
		expect(form.partner.code).toBeNull();
		expect(form.opponents[0].code).toBe(code('kit'));
		expect(form.opponents[1].code).toBeNull();
	});
});
