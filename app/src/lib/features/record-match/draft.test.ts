import { describe, expect, it } from 'vitest';
import {
	buildCode,
	parsePlayerCode,
	type Match,
	type MatchCode,
	type PlayerCode
} from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import {
	correctionDraft,
	createDraftStore,
	draftKey,
	isBlank,
	parseDraft,
	type Draft
} from './draft.js';
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

describe('correctionDraft', () => {
	const who = (key: string, name: string) => ({ code: code(key), displayName: name });
	const match = (overrides: Partial<Match> = {}): Match => ({
		code: buildCode('match', '7QK2H9WD3NF') as MatchCode,
		status: 'disputed',
		format: 'doubles',
		playedOn: '2026-11-14',
		bestOf: 3,
		scoringType: 'rally',
		gameTarget: 15,
		teamA: { side: 'a', players: [who('bea', 'Bea Marlowe'), who('kit', 'Kit Ashdown')] },
		teamB: { side: 'b', players: [who('tamsin', 'Tamsin Vale'), who('oren', 'Oren Quill')] },
		games: [
			{ number: 1, teamA: 15, teamB: 9 },
			{ number: 2, teamA: 12, teamB: 15 }
		],
		viewerSide: 'b',
		viewerDecision: 'dispute',
		confirmedBySide: { a: true, b: false },
		createdAt: '2026-11-14T18:00:00Z',
		...overrides
	});

	it("starts from the match, from the player's own side, with their points first", () => {
		expect(correctionDraft(match(), code('tamsin'))).toEqual({
			format: 'doubles',
			playedOn: '2026-11-14',
			gameTarget: 15,
			scoringType: 'rally',
			partner: { code: code('oren'), name: 'Oren Quill' },
			opponents: [
				{ code: code('bea'), name: 'Bea Marlowe' },
				{ code: code('kit'), name: 'Kit Ashdown' }
			],
			games: [
				{ a: '9', b: '15' },
				{ a: '15', b: '12' }
			]
		});
	});

	it('leaves the partner and second opponent empty for singles', () => {
		const singles = match({
			format: 'singles',
			teamA: { side: 'a', players: [who('tamsin', 'Tamsin Vale')] },
			teamB: { side: 'b', players: [who('rosa', 'Rosa Fenwick')] },
			viewerSide: 'a'
		});
		const draft = correctionDraft(singles, code('tamsin'));
		expect(draft?.partner).toEqual({ code: null, name: '' });
		expect(draft?.opponents).toEqual([
			{ code: code('rosa'), name: 'Rosa Fenwick' },
			{ code: null, name: '' }
		]);
		expect(draft?.games[0]).toEqual({ a: '15', b: '9' });
	});

	it('gives nothing when the player is not in the match, or a player is private', () => {
		expect(correctionDraft(match(), code('rosa'))).toBeNull();
		const hidden = match({
			teamA: {
				side: 'a',
				players: [{ code: null, displayName: 'Private player' }, who('kit', 'Kit Ashdown')]
			}
		});
		expect(correctionDraft(hidden, code('tamsin'))).toBeNull();
	});

	it('fills a correcting form that keeps the same players', () => {
		const form = new RecordForm(code('tamsin'), { correcting: true });
		form.restore(correctionDraft(match(), code('tamsin'))!);
		expect(form.input.teamA).toEqual([code('tamsin'), code('oren')]);
		expect(form.input.teamB).toEqual([code('bea'), code('kit')]);
		expect(form.summary).toEqual([]);
	});
});
