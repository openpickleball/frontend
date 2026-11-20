/**
 * OPEN codes: the public identifiers of players and matches.
 *
 * A port of backend `apps/public_ids/codes.py`. A code is a type prefix, random
 * characters and one check character from Crockford's base32 alphabet, in groups
 * of four: `P-7K3M-QX9H`. The check character is Luhn mod 32 over the prefix and
 * the random characters, so one wrong character, or a code moved to another type,
 * fails the check. Keep this file in step with the backend: the backend decides
 * what a valid code is.
 */
import { err, ok, type Result } from './result';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BASE = ALPHABET.length;
const GROUP = 4;
/** Longer input is refused before any other work. Code inputs use it as their `maxlength`. */
export const CODE_INPUT_MAX_LENGTH = 64;
/** Letters people type for digits. No prefix is one of these. */
const LOOKALIKES: Record<string, string> = { I: '1', L: '1', O: '0' };

/**
 * The kinds of record the app reads codes for. Lengths count the random part and
 * the check character, not the prefix. The backend also has clubs (C), events (E)
 * and organizers (G), which the app does not use yet.
 */
export const CODE_TYPES = {
	player: { prefix: 'P', length: 8 },
	match: { prefix: 'M', length: 12 }
} as const;

export type CodeTypeName = keyof typeof CODE_TYPES;

export type PlayerCode = string & { readonly __brand: 'PlayerCode' };
export type MatchCode = string & { readonly __brand: 'MatchCode' };

export type CodeErrorReason =
	| 'not_text'
	| 'too_long'
	| 'not_ascii'
	| 'wrong_length'
	| 'wrong_prefix'
	| 'bad_character'
	| 'bad_check';

export type CodeError = { reason: CodeErrorReason; message: string };

const MESSAGES: Record<CodeErrorReason, string> = {
	not_text: 'Enter an OPEN code.',
	too_long: 'That is too long to be an OPEN code.',
	not_ascii: 'An OPEN code uses only letters and numbers.',
	wrong_length: 'That OPEN code is the wrong length.',
	wrong_prefix: 'That is not the right kind of OPEN code.',
	bad_character: 'An OPEN code uses only letters and numbers.',
	bad_check: 'That OPEN code does not look right. Check each character.'
};

function codeError(reason: CodeErrorReason): CodeError {
	return { reason, message: MESSAGES[reason] };
}

function luhnSum(text: string, startFactor: number): number {
	let factor = startFactor;
	let total = 0;
	for (let i = text.length - 1; i >= 0; i--) {
		const addend = factor * ALPHABET.indexOf(text[i]);
		factor = factor === 2 ? 1 : 2;
		total += Math.floor(addend / BASE) + (addend % BASE);
	}
	return total;
}

/** The Luhn mod 32 check character for `text` (prefix and random part). */
export function checkCharacter(text: string): string {
	return ALPHABET[(BASE - (luhnSum(text, 2) % BASE)) % BASE];
}

/** Whether `text` ends in the right check character. `text` must use only alphabet characters. */
export function isValidCodeText(text: string): boolean {
	return luhnSum(text, 1) % BASE === 0;
}

/** The canonical form: prefix, then the body in groups of four. */
export function formatCode(type: CodeTypeName, body: string): string {
	const upper = body.toUpperCase();
	const groups: string[] = [];
	for (let start = 0; start < upper.length; start += GROUP) {
		groups.push(upper.slice(start, start + GROUP));
	}
	return [CODE_TYPES[type].prefix, ...groups].join('-');
}

/**
 * Builds a code in canonical form from its random part (length - 1 alphabet
 * characters), adding the check character. For fixtures and tests.
 */
export function buildCode(type: CodeTypeName, randomPart: string): string {
	const { prefix, length } = CODE_TYPES[type];
	const random = randomPart.toUpperCase();
	if (random.length !== length - 1 || [...random].some((c) => !ALPHABET.includes(c))) {
		throw new RangeError(`A ${type} code needs ${length - 1} characters from the OPEN alphabet.`);
	}
	return formatCode(type, random + checkCharacter(prefix + random));
}

function isAscii(text: string): boolean {
	// eslint-disable-next-line no-control-regex
	return /^[\u0000-\u007f]*$/.test(text);
}

/**
 * The canonical form of `raw` as a code of `type`, or the reason it is not one.
 *
 * Accepts any case, spaces and hyphens anywhere, a missing prefix, and I, L or O
 * typed for 1 or 0. Refuses the wrong prefix, the wrong length, a character
 * outside the alphabet, or a failed check. Never throws for bad input.
 */
export function normalizeCode(raw: unknown, type: CodeTypeName): Result<string, CodeError> {
	if (typeof raw !== 'string') return err(codeError('not_text'));
	if (raw.length > CODE_INPUT_MAX_LENGTH) return err(codeError('too_long'));
	// Refuse non-ASCII before changing case: uppercasing some Unicode letters (a
	// dotless i) gives an ASCII letter.
	if (!isAscii(raw)) return err(codeError('not_ascii'));
	const { prefix, length } = CODE_TYPES[type];
	const compact = raw.toUpperCase().replaceAll(' ', '').replaceAll('-', '');
	let body: string;
	if (compact.length === length + 1) {
		if (compact[0] !== prefix) return err(codeError('wrong_prefix'));
		body = compact.slice(1);
	} else if (compact.length === length) {
		body = compact;
	} else {
		return err(codeError('wrong_length'));
	}
	body = body.replace(/[ILO]/g, (c) => LOOKALIKES[c]);
	if ([...body].some((c) => !ALPHABET.includes(c))) return err(codeError('bad_character'));
	if (!isValidCodeText(prefix + body)) return err(codeError('bad_check'));
	return ok(formatCode(type, body));
}

/** Parses user input into a branded player code (`P-7K3M-QX9H`). */
export function parsePlayerCode(raw: unknown): Result<PlayerCode, CodeError> {
	const result = normalizeCode(raw, 'player');
	return result.ok ? ok(result.value as PlayerCode) : result;
}

/** Parses user input into a branded match code (`M-9QF6-RD2K-X3BP`). */
export function parseMatchCode(raw: unknown): Result<MatchCode, CodeError> {
	const result = normalizeCode(raw, 'match');
	return result.ok ? ok(result.value as MatchCode) : result;
}
