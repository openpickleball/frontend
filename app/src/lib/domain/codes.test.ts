/**
 * Ported from backend `apps/public_ids/tests/test_codes.py`. The names of the
 * backend tests are in the comments. Codes here are made up.
 */
import { describe, expect, it } from 'vitest';
import {
	ALPHABET,
	CODE_INPUT_MAX_LENGTH,
	CODE_TYPES,
	buildCode,
	checkCharacter,
	formatCode,
	isValidCodeText,
	normalizeCode,
	parseMatchCode,
	parsePlayerCode,
	type CodeTypeName
} from './codes';

// A seeded generator, so a failure is reproducible (the backend seeds Python's `random` with 92).
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const random = mulberry32(92);
const randomInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

/** Luhn mod 32 validity, written out the long way (backend `_reference_valid`). */
function referenceValid(text: string): boolean {
	let total = 0;
	[...text].reverse().forEach((char, position) => {
		let value = ALPHABET.indexOf(char);
		if (position % 2 === 1) {
			value *= 2;
			value = Math.floor(value / 32) + (value % 32);
		}
		total += value;
	});
	return total % 32 === 0;
}

/** The one character that makes `text` plus it valid, by search (backend `_reference_check`). */
function referenceCheck(text: string): string {
	const matches = [...ALPHABET].filter((char) => referenceValid(text + char));
	expect(matches).toHaveLength(1);
	return matches[0];
}

const randomBody = (length: number) => Array.from({ length }, () => pick([...ALPHABET])).join('');

/** A made-up valid code without hyphens: prefix, random, check. */
function validCompact(type: CodeTypeName): string {
	const text = CODE_TYPES[type].prefix + randomBody(CODE_TYPES[type].length - 1);
	return text + referenceCheck(text);
}

const TYPES = Object.keys(CODE_TYPES) as CodeTypeName[];

describe('alphabet and code types', () => {
	// test_alphabet_is_crockford_base32
	it('is Crockford base32', () => {
		expect(ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
		expect(new Set(ALPHABET).size).toBe(32);
		for (const excluded of 'ILOU') expect(ALPHABET).not.toContain(excluded);
	});

	// test_code_type_prefix_and_length (player and match only)
	it.each([
		['player', 'P', 8],
		['match', 'M', 12]
	] as const)('%s has prefix %s and length %i', (type, prefix, length) => {
		expect(CODE_TYPES[type].prefix).toBe(prefix);
		expect(CODE_TYPES[type].length).toBe(length);
		expect(ALPHABET).toContain(prefix);
	});

	// test_prefixes_are_distinct
	it('has distinct prefixes', () => {
		const prefixes = TYPES.map((type) => CODE_TYPES[type].prefix);
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});
});

describe('check character', () => {
	// test_check_character_known_vectors
	it.each([
		['P0000000', 'A'],
		['P7K3MQX9', 'H'],
		['M9QF6RD2KX3B', 'P']
	])('known vector %s -> %s', (text, check) => {
		expect(referenceCheck(text)).toBe(check);
		expect(checkCharacter(text)).toBe(check);
	});

	// test_check_character_matches_reference
	it('matches the reference on 500 random texts', () => {
		for (let i = 0; i < 500; i++) {
			const text = pick([...'PCEGM']) + randomBody(randomInt(1, 15));
			expect(checkCharacter(text)).toBe(referenceCheck(text));
		}
	});

	// test_is_valid_matches_reference
	it('isValidCodeText matches the reference on 500 random texts', () => {
		for (let i = 0; i < 500; i++) {
			const text = randomBody(randomInt(2, 16));
			expect(isValidCodeText(text)).toBe(referenceValid(text));
		}
	});

	// test_is_valid_accepts_text_with_its_check_character
	it('accepts text with its check character', () => {
		const text = 'C4M2Z9Q';
		expect(isValidCodeText(text + checkCharacter(text))).toBe(true);
	});

	// test_every_single_substitution_fails_the_check
	it('fails every single-character substitution', () => {
		for (const type of TYPES) {
			const compact = validCompact(type);
			for (let position = 0; position < compact.length; position++) {
				for (const other of ALPHABET) {
					if (other === compact[position]) continue;
					const changed = compact.slice(0, position) + other + compact.slice(position + 1);
					expect(isValidCodeText(changed)).toBe(false);
				}
			}
		}
	});

	// test_most_adjacent_transpositions_fail_the_check
	it('catches at least 95% of adjacent transpositions', () => {
		let caught = 0;
		let total = 0;
		for (let i = 0; i < 200; i++) {
			const compact = validCompact(pick(TYPES));
			for (let position = 0; position < compact.length - 1; position++) {
				const first = compact[position];
				const second = compact[position + 1];
				if (first === second) continue;
				const swapped = compact.slice(0, position) + second + first + compact.slice(position + 2);
				total += 1;
				if (!isValidCodeText(swapped)) caught += 1;
			}
		}
		expect(caught / total).toBeGreaterThanOrEqual(0.95);
	});

	// test_check_covers_the_prefix
	it('covers the prefix', () => {
		const body = '7K3MQX9';
		const player = 'P' + body + checkCharacter('P' + body);
		expect(isValidCodeText('C' + player.slice(1))).toBe(false);
	});
});

describe('formatCode and buildCode', () => {
	// test_format_code_groups_the_body
	it('groups the body in fours', () => {
		expect(formatCode('player', '7k3mqx9h')).toBe('P-7K3M-QX9H');
		expect(formatCode('match', '9QF6RD2KX3BP')).toBe('M-9QF6-RD2K-X3BP');
	});

	// Stands in for test_generate_returns_a_valid_canonical_code: the app builds codes
	// for fixtures, it does not generate random ones.
	it.each(TYPES)('builds a valid canonical %s code', (type) => {
		const code = buildCode(type, randomBody(CODE_TYPES[type].length - 1));
		const [prefix, ...groups] = code.split('-');
		expect(prefix).toBe(CODE_TYPES[type].prefix);
		expect(groups.every((group) => group.length === 4)).toBe(true);
		const body = groups.join('');
		expect(body).toHaveLength(CODE_TYPES[type].length);
		expect([...body].every((char) => ALPHABET.includes(char))).toBe(true);
		expect(isValidCodeText(prefix + body)).toBe(true);
		expect(normalizeCode(code, type)).toEqual({ ok: true, value: code });
	});

	// test_generate_lengths
	it('builds codes of 11 (player) and 16 (match) characters', () => {
		expect(buildCode('player', '7K3MQX9')).toHaveLength(11);
		expect(buildCode('match', '9QF6RD2KX3B')).toHaveLength(16);
	});

	it('builds the backend vectors', () => {
		expect(buildCode('player', '7K3MQX9')).toBe('P-7K3M-QX9H');
		expect(buildCode('match', '9QF6RD2KX3B')).toBe('M-9QF6-RD2K-X3BP');
	});

	it('refuses a random part of the wrong length or alphabet', () => {
		expect(() => buildCode('player', '7K3M')).toThrow(RangeError);
		expect(() => buildCode('player', '7K3MQXU')).toThrow(RangeError);
	});
});

describe('normalizeCode', () => {
	const player = (raw: unknown) => {
		const result = normalizeCode(raw, 'player');
		return result.ok ? result.value : null;
	};

	// test_normalize_accepts_the_canonical_form
	it('accepts the canonical form', () => {
		expect(player('P-7K3M-QX9H')).toBe('P-7K3M-QX9H');
	});

	// test_normalize_accepts_loose_forms
	it.each([
		'p-7k3m-qx9h',
		'P7K3MQX9H',
		'p7k3mqx9h',
		' P 7K3M QX9H ',
		'P--7K3M--QX9H',
		'7K3M-QX9H',
		'7k3mqx9h'
	])('accepts the loose form %j', (raw) => {
		expect(player(raw)).toBe('P-7K3M-QX9H');
	});

	// test_normalize_maps_i_l_and_o
	it('maps I, L and O to 1 and 0', () => {
		// The valid code is P-1101-0105: each 1 is written as I or L, each 0 as O.
		expect(player('PILOLoiO5')).toBe('P-1101-0105');
	});

	// test_normalize_matches_a_match_code
	it('normalizes a match code', () => {
		expect(normalizeCode('m9qf6rd2kx3bp', 'match')).toEqual({
			ok: true,
			value: 'M-9QF6-RD2K-X3BP'
		});
	});

	// test_normalize_rejects_bad_player_input
	it.each([
		// Wrong prefix for the endpoint.
		'C-7K3M-QX9H',
		'M-7K3M-QX9H',
		// One wrong character.
		'P-7K3M-QX9J',
		'P-8K3M-QX9H',
		// U is not in the alphabet.
		'P-7K3M-QXUH',
		// Wrong lengths.
		'P-7K3M-QX9',
		'P-7K3M-QX9H6',
		'',
		'P',
		'-',
		// A 6-character external player ID.
		'7K3MQX',
		'AB12CD',
		// A player code on the match endpoint has the wrong length.
		'P7K3MQX9H000',
		// Other characters.
		'P-7K3M_QX9H',
		'P.7K3M.QX9H',
		'P-7K3M-QX9ı',
		'P-7K3M-QX9H ',
		'Ｐ' + '7K3MQX9H',
		// Too long, even if mostly separators.
		'P-7K3M-QX9H' + ' '.repeat(60)
	])('rejects the bad player input %j', (raw) => {
		expect(player(raw)).toBeNull();
	});

	// test_normalize_rejects_dotless_i_before_case_folding
	it('rejects a dotless i before case folding', () => {
		// Uppercasing a dotless i gives I, which would map to 1.
		const text = 'P7K3MQX1';
		const code = text + checkCharacter(text);
		const unicodeForm = code.replaceAll('1', 'ı');
		expect(player(code)).not.toBeNull();
		expect(player(unicodeForm)).toBeNull();
	});

	// test_normalize_rejects_non_strings
	it.each([null, undefined, 7, ['P7K3MQX9H'], {}, new Uint8Array([80])])(
		'rejects the non-string %j',
		(raw) => {
			expect(player(raw)).toBeNull();
			const result = normalizeCode(raw, 'player');
			expect(result.ok === false && result.error.reason).toBe('not_text');
		}
	);

	// test_normalize_accepts_at_most_64_characters
	it('accepts at most 64 characters', () => {
		const padded = 'P-7K3M-QX9H'.padEnd(64);
		expect(player(padded)).toBe('P-7K3M-QX9H');
		expect(player(padded + ' ')).toBeNull();
	});

	// test_normalize_wrong_prefix_for_each_type
	it('refuses a code of another type with the same length', () => {
		// Only player and match are used here, and they differ in length, so the
		// same-length check has no pair. A player code is refused as a match code
		// and the other way round.
		for (const type of TYPES) {
			const compact = validCompact(type);
			for (const other of TYPES) {
				if (other === type) continue;
				expect(normalizeCode(compact, other).ok).toBe(false);
			}
		}
	});

	it('refuses a prefix of the wrong type when the length fits', () => {
		// Swap the prefix of a valid player code: the check no longer holds, but the
		// prefix test comes first.
		const result = normalizeCode('C7K3MQX9H', 'player');
		expect(result).toMatchObject({ ok: false, error: { reason: 'wrong_prefix' } });
	});

	it('reports why a code failed', () => {
		const reason = (raw: unknown) => {
			const result = normalizeCode(raw, 'player');
			return result.ok ? null : result.error.reason;
		};
		expect(reason('P-7K3M-QX9J')).toBe('bad_check');
		expect(reason('P-7K3M-QXUH')).toBe('bad_character');
		expect(reason('P-7K3M')).toBe('wrong_length');
		expect(reason('P-7K3M-QX9ı')).toBe('not_ascii');
		expect(reason('x'.repeat(CODE_INPUT_MAX_LENGTH + 1))).toBe('too_long');
		expect(CODE_INPUT_MAX_LENGTH).toBe(64);
	});
});

describe('parsePlayerCode and parseMatchCode', () => {
	it('returns a branded, normalized player code', () => {
		const result = parsePlayerCode(' p 7k3m-qx9h ');
		expect(result).toEqual({ ok: true, value: 'P-7K3M-QX9H' });
	});

	it('returns a branded, normalized match code', () => {
		expect(parseMatchCode('m9qf6rd2kx3bp')).toEqual({ ok: true, value: 'M-9QF6-RD2K-X3BP' });
	});

	it('returns an error value, not a throw, for bad input', () => {
		const result = parsePlayerCode('P-7K3M-QX9J');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toMatch(/does not look right/);
	});

	it('refuses a player code as a match code and the reverse', () => {
		expect(parseMatchCode('P-7K3M-QX9H').ok).toBe(false);
		expect(parsePlayerCode('M-9QF6-RD2K-X3BP').ok).toBe(false);
	});

	it('keeps the two brands apart in types', () => {
		const player = parsePlayerCode('P-7K3M-QX9H');
		const match = parseMatchCode('M-9QF6-RD2K-X3BP');
		if (!player.ok || !match.ok) throw new Error('fixture codes are valid');
		// @ts-expect-error a MatchCode is not a PlayerCode
		const wrong: typeof player.value = match.value;
		expect(wrong).toBe('M-9QF6-RD2K-X3BP');
	});
});
