/**
 * The email cases are ported from backend `apps/accounts/tests/test_canonical_email.py`
 * and `test_headless_email_rules.py`. The password minimum is Django's default
 * `MinimumLengthValidator` (8), which `config/settings.py` lists with no options.
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { buildCode } from './codes';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	birthMonthSchema,
	birthYearSchema,
	emailSchema,
	loginSchema,
	matchInputSchema,
	normalizeEmail,
	passwordResetRequestSchema,
	passwordResetSchema,
	signupAccountSchema,
	signupAgeSchema,
	signupDetailsSchema,
	signupSchema,
	zodFieldErrors,
	type MatchInput
} from './schemas';

const A1 = buildCode('player', 'AAAA111');
const B1 = buildCode('player', 'BBBB111');

function matchInput(overrides: Partial<MatchInput> = {}): MatchInput {
	return {
		format: 'singles',
		playedOn: '2026-06-01',
		teamA: [A1],
		teamB: [B1],
		games: [{ teamA: 11, teamB: 5 }],
		...overrides
	};
}

describe('matchInputSchema', () => {
	it('returns a validated match with defaults and normalized codes', () => {
		const parsed = matchInputSchema.parse(
			matchInput({ teamA: [A1.toLowerCase().replaceAll('-', ' ')], teamB: [B1] })
		);
		expect(parsed).toEqual({
			format: 'singles',
			playedOn: '2026-06-01',
			teamA: [A1],
			teamB: [B1],
			games: [{ teamA: 11, teamB: 5 }],
			bestOf: 1,
			gameTarget: 11,
			scoringType: 'side_out'
		});
	});

	it('keys score issues the way the backend does once body. is stripped', () => {
		const result = matchInputSchema.safeParse(
			matchInput({
				games: [
					{ teamA: 11, teamB: 5 },
					{ teamA: 12, teamB: 9 }
				],
				bestOf: 3
			})
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(Object.keys(zodFieldErrors(result.error))).toEqual(['games.1']);
			expect(result.error.issues[0]).toMatchObject({
				path: ['games', 1],
				params: { code: 'played_past_target' }
			});
		}
	});

	it('keys team and date issues as team_a.0 and played_on', () => {
		const result = matchInputSchema.safeParse(
			matchInput({ teamA: ['P-7K3M-QX9J'], playedOn: '2999-01-01' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			const fields = zodFieldErrors(result.error);
			expect(Object.keys(fields).sort()).toEqual(['played_on', 'team_a.0']);
			expect(fields.played_on).toEqual(['The date played cannot be in the future.']);
		}
	});

	it('reports a tie in game 2 at games.1', () => {
		const result = matchInputSchema.safeParse(
			matchInput({
				games: [
					{ teamA: 11, teamB: 5 },
					{ teamA: 9, teamB: 9 }
				]
			})
		);
		expect(!result.success && zodFieldErrors(result.error)).toEqual({
			'games.1': ['Game 2 cannot end in a tie.']
		});
	});

	it('maps the form names to the backend names for shape errors', () => {
		const result = matchInputSchema.safeParse({ ...matchInput(), playedOn: 20260601 });
		expect(!result.success && Object.keys(zodFieldErrors(result.error))).toEqual(['played_on']);
		const floats = matchInputSchema.safeParse(matchInput({ games: [{ teamA: 11.5, teamB: 5 }] }));
		expect(!floats.success && zodFieldErrors(floats.error)).toEqual({
			'games.0': ['Game 1: enter each score as a whole number.']
		});
	});

	it('reports a NaN score and a bad code together', () => {
		const result = matchInputSchema.safeParse(
			matchInput({ teamA: ['P-7K3M-QX9J'], games: [{ teamA: NaN, teamB: 5 }] })
		);
		expect(!result.success && Object.keys(zodFieldErrors(result.error)).sort()).toEqual([
			'games.0',
			'team_a.0'
		]);
	});

	it('reports a non-string team entry with the other issues', () => {
		const result = matchInputSchema.safeParse({
			...matchInput({ playedOn: '2999-01-01' }),
			teamB: [5]
		});
		expect(!result.success && Object.keys(zodFieldErrors(result.error)).sort()).toEqual([
			'played_on',
			'team_b'
		]);
	});

	it('uses the backend choice messages', () => {
		const result = matchInputSchema.safeParse({ ...matchInput(), gameTarget: 25 });
		expect(!result.success && zodFieldErrors(result.error)).toEqual({
			game_target: ['Choose a game target of 11, 15, or 21.']
		});
	});

	it('rejects input that is not an object', () => {
		expect(matchInputSchema.safeParse(null).success).toBe(false);
		expect(matchInputSchema.safeParse('x').success).toBe(false);
	});
});

describe('normalizeEmail', () => {
	// test_signup_stores_the_normalized_address
	it('strips whitespace and lowercases', () => {
		expect(normalizeEmail('  Info@Example.ORG ')).toBe('info@example.org');
	});
	it('folds compatibility characters with NFKC', () => {
		expect(normalizeEmail('sam@ｅｘａｍｐｌｅ.org')).toBe('sam@example.org');
	});
});

describe('emailSchema (sign-up and reset request)', () => {
	it.each(['sam@example.org', ' Sam@Example.ORG ', 'SAM@EXAMPLE.ORG', 'a.b+c@sub.example.org'])(
		'accepts %j',
		(email) => {
			expect(emailSchema.safeParse(email).success).toBe(true);
		}
	);

	it('returns the normalized address', () => {
		expect(emailSchema.parse('  Info@Example.ORG ')).toBe('info@example.org');
	});

	// test_signup_refuses_a_non_ascii_address_without_echoing_it
	it('refuses a non-ASCII address without echoing it', () => {
		const result = emailSchema.safeParse('ınfo@example.org');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toHaveLength(1);
			expect(result.error.issues[0].message).toBe(
				'Email addresses may contain only ASCII characters.'
			);
			expect(JSON.stringify(result.error.issues)).not.toContain('nfo@');
		}
	});

	// test_signup_refuses_an_address_too_long_once_normalized
	it('refuses an address that is too long once normalized', () => {
		const label = 'ﬀ'.repeat(31) + 'a';
		const email = `a@${label}.${label}.${label}.${label}.org`;
		expect(email.length).toBeLessThanOrEqual(EMAIL_MAX_LENGTH);
		expect(normalizeEmail(email).length).toBeGreaterThan(EMAIL_MAX_LENGTH);
		const result = emailSchema.safeParse(email);
		expect(!result.success && result.error.issues[0].message).toBe(
			`Email addresses may be at most ${EMAIL_MAX_LENGTH} characters.`
		);
	});

	// test_non_canonical_addresses: the format cases (long, no @, empty)
	it.each(['not-an-address', '', '@example.org', 'sam@', 'sam@example', 'sam@@example.org'])(
		'refuses the malformed address %j',
		(email) => {
			const result = emailSchema.safeParse(email);
			expect(!result.success && result.error.issues[0].message).toBe(
				'Enter a valid email address.'
			);
		}
	);

	it('accepts an address of exactly the maximum length and refuses one more', () => {
		const email = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.org'.length) + '@example.org';
		expect(email).toHaveLength(EMAIL_MAX_LENGTH);
		expect(emailSchema.safeParse(email).success).toBe(true);
		expect(emailSchema.safeParse('a' + email).success).toBe(false);
	});

	it('refuses a value that is not text', () => {
		expect(emailSchema.safeParse(undefined).success).toBe(false);
		expect(emailSchema.safeParse(5).success).toBe(false);
	});
});

describe('loginSchema', () => {
	// test_canonical_addresses
	it.each(['sam@example.org', ' Sam@Example.ORG ', 'SAM@EXAMPLE.ORG'])(
		'accepts the canonical address %j',
		(email) => {
			const result = loginSchema.safeParse({ email, password: 'x' });
			expect(result.success && result.data.email).toBe('sam@example.org');
		}
	);

	// test_non_canonical_addresses: the backend refuses these at login.
	it.each([
		'ſam@example.org', // U+017F LATIN SMALL LETTER LONG S
		'sam@ｅｘａｍｐｌｅ.org', // fullwidth "example"
		'Kate@example.org', // U+212A KELVIN SIGN, lowercases to "k"
		'ınfo@example.org', // U+0131 dotless i
		'jörg@example.org', // non-ASCII
		'a'.repeat(EMAIL_MAX_LENGTH - '@example.org'.length + 1) + '@example.org',
		'not-an-address',
		''
	])('refuses the non-canonical address %j', (email) => {
		expect(loginSchema.safeParse({ email, password: 'x' }).success).toBe(false);
	});

	it('needs a password, and does not trim or length-check it', () => {
		expect(loginSchema.safeParse({ email: 'sam@example.org', password: '' }).success).toBe(false);
		const short = loginSchema.safeParse({ email: 'sam@example.org', password: ' a ' });
		expect(short.success && short.data.password).toBe(' a ');
	});
});

const CHOSEN = { city: 'Austin', region: 'Texas' };

/** A made-up player's details, as the form holds them. */
const detailsInput = {
	birth_month: '6',
	birth_year: '1990',
	gender_division: 'mens',
	first_name: 'Sam',
	last_name: 'Rivera',
	city: { text: '', chosen: null },
	accepted_terms: true,
	accepted_privacy: true
};

const messages = (result: { success: boolean; error?: z.ZodError }) =>
	result.error ? zodFieldErrors(result.error) : {};

describe('signupAccountSchema', () => {
	const input = {
		email: ' Sam@Example.org ',
		password: 'longenough',
		password_confirm: 'longenough'
	};

	it('gives the normalized email and the password only', () => {
		expect(signupAccountSchema.parse(input)).toEqual({
			email: 'sam@example.org',
			password: 'longenough'
		});
	});

	it('says when the passwords do not match, even when another field fails', () => {
		const result = signupAccountSchema.safeParse({
			...input,
			email: 'nope',
			password_confirm: 'x'
		});
		expect(messages(result)).toEqual({
			email: ['Enter a valid email address.'],
			password_confirm: ["The passwords don't match."]
		});
	});

	it('treats a missing confirmation as a mismatch', () => {
		const result = signupAccountSchema.safeParse({ ...input, password_confirm: undefined });
		expect(messages(result)).toEqual({ password_confirm: ["The passwords don't match."] });
	});
});

describe('signupAgeSchema', () => {
	it('gives the month and year as numbers', () => {
		expect(signupAgeSchema.parse({ birth_month: '6', birth_year: '1990' })).toEqual({
			birth_month: 6,
			birth_year: 1990
		});
	});

	it('reports both fields at once, and never reads empty as zero', () => {
		const result = signupAgeSchema.safeParse({ birth_month: '', birth_year: '' });
		expect(messages(result)).toEqual({
			birth_month: ['Enter your birth month.'],
			birth_year: ['Enter your birth year.']
		});
	});
});

describe('signupDetailsSchema', () => {
	const parse = (override: Record<string, unknown>) =>
		signupDetailsSchema.safeParse({ ...detailsInput, ...override });

	it('gives the parsed details, with no city when the field is empty', () => {
		const result = signupDetailsSchema.safeParse(detailsInput);
		expect(result.success && result.data).toStrictEqual({
			birth_month: 6,
			birth_year: 1990,
			gender_division: 'mens',
			first_name: 'Sam',
			last_name: 'Rivera',
			accepted_terms: true,
			accepted_privacy: true
		});
	});

	it('trims the names', () => {
		const result = parse({ first_name: '  Sam ', last_name: ' Rivera  ' });
		expect(result.success && [result.data.first_name, result.data.last_name]).toEqual([
			'Sam',
			'Rivera'
		]);
	});

	it.each(['', '   ', undefined])('asks for the names when they are %j', (value) => {
		const result = parse({ first_name: value, last_name: value });
		expect(messages(result)).toEqual({
			first_name: ['Enter your first name.'],
			last_name: ['Enter your last name.']
		});
	});

	it('counts code points: a first name of 61 is fine, 62 is not', () => {
		expect(parse({ first_name: 'é'.repeat(61), last_name: 'R' }).success).toBe(true);
		expect(messages(parse({ first_name: 'é'.repeat(62), last_name: 'R' }))).toEqual({
			first_name: ['Your first name can be at most 61 characters.']
		});
	});

	it('counts the first and last name together: 64 is fine, 65 is not', () => {
		// 30 + a space + 33 is 64.
		expect(parse({ first_name: 'é'.repeat(30), last_name: 'é'.repeat(33) }).success).toBe(true);
		expect(messages(parse({ first_name: 'é'.repeat(30), last_name: 'é'.repeat(34) }))).toEqual({
			last_name: ['Your first and last name together can be at most 63 characters.']
		});
	});

	it('counts a decomposed letter as two code points', () => {
		// "e" plus a combining accent is 2 code points, so 31 of them is 62 and 61 total is too long.
		const decomposed = 'é';
		expect(parse({ first_name: decomposed.repeat(31), last_name: 'R' }).success).toBe(false);
		expect(parse({ first_name: decomposed.repeat(30), last_name: 'R' }).success).toBe(true);
	});

	it('reports only the first name message when the first name alone is too long', () => {
		const result = parse({ first_name: 'é'.repeat(62), last_name: 'é'.repeat(40) });
		expect(messages(result)).toEqual({
			first_name: ['Your first name can be at most 61 characters.']
		});
	});

	it('takes the chosen city and region', () => {
		const result = parse({ city: { text: 'Aus', chosen: CHOSEN } });
		expect(result.success && result.data).toMatchObject({ city: 'Austin', region: 'Texas' });
	});

	it('leaves the city out when the text is only spaces', () => {
		const result = parse({ city: { text: '   ', chosen: null } });
		expect(result.success && 'city' in result.data).toBe(false);
		expect(result.success && 'region' in result.data).toBe(false);
	});

	it('leaves the city out when the field is missing', () => {
		expect(parse({ city: undefined }).success).toBe(true);
	});

	it('asks to choose from the list when there is text but no choice', () => {
		const result = parse({ city: { text: 'Aus', chosen: null } });
		expect(messages(result)).toEqual({
			city: ['Choose your city from the list, or clear the field.']
		});
	});

	it.each([false, undefined])('asks for the Terms when it is %j', (value) => {
		expect(messages(parse({ accepted_terms: value }))).toEqual({
			accepted_terms: ['Accept the Terms of Service.']
		});
	});

	it.each([false, undefined])('asks for the Privacy Policy when it is %j', (value) => {
		expect(messages(parse({ accepted_privacy: value }))).toEqual({
			accepted_privacy: ['Accept the Privacy Policy.']
		});
	});

	it('reports every field at once', () => {
		const result = signupDetailsSchema.safeParse({
			birth_month: '',
			birth_year: '',
			gender_division: '',
			first_name: '',
			last_name: '',
			city: { text: 'x', chosen: null }
		});
		expect(Object.keys(messages(result))).toEqual([
			'birth_month',
			'birth_year',
			'gender_division',
			'first_name',
			'last_name',
			'city',
			'accepted_terms',
			'accepted_privacy'
		]);
	});
});

describe('signupSchema and password rules', () => {
	const email = 'sam@example.org';
	const base = {
		...detailsInput,
		email,
		password: 'longenough',
		password_confirm: 'longenough'
	};
	const withPassword = (password: string) => ({
		...base,
		password,
		password_confirm: password
	});

	it('uses the backend minimum of 8 characters', () => {
		expect(PASSWORD_MIN_LENGTH).toBe(8);
		expect(signupSchema.safeParse(withPassword('a'.repeat(7))).success).toBe(false);
		expect(signupSchema.safeParse(withPassword('a'.repeat(8))).success).toBe(true);
	});

	it('names the minimum in the message', () => {
		const result = signupSchema.safeParse(withPassword('short'));
		expect(messages(result)).toEqual({ password: ['Use at least 8 characters.'] });
	});

	it('keys email issues under email', () => {
		const result = signupSchema.safeParse({ ...base, email: 'nope' });
		expect(messages(result)).toEqual({ email: ['Enter a valid email address.'] });
	});

	it('normalizes the email', () => {
		const result = signupSchema.safeParse({ ...base, email: ' Sam@Example.org ' });
		expect(result.success && result.data.email).toBe('sam@example.org');
	});

	it('does not trim the password', () => {
		const result = signupSchema.safeParse(withPassword('  spaces  '));
		expect(result.success && result.data.password).toBe('  spaces  ');
	});

	it('gives exactly the request body, with no city or region when none was chosen', () => {
		const result = signupSchema.safeParse(base);
		expect(result.success && result.data).toStrictEqual({
			email,
			password: 'longenough',
			birth_year: 1990,
			birth_month: 6,
			gender_division: 'mens',
			first_name: 'Sam',
			last_name: 'Rivera',
			accepted_terms: true,
			accepted_privacy: true
		});
	});

	it('adds the city and region when one was chosen', () => {
		const result = signupSchema.safeParse({ ...base, city: { text: 'Aus', chosen: CHOSEN } });
		expect(result.success && result.data).toStrictEqual({
			email,
			password: 'longenough',
			birth_year: 1990,
			birth_month: 6,
			gender_division: 'mens',
			first_name: 'Sam',
			last_name: 'Rivera',
			city: 'Austin',
			region: 'Texas',
			accepted_terms: true,
			accepted_privacy: true
		});
	});

	it('says when the passwords do not match, on the confirm field', () => {
		const result = signupSchema.safeParse({ ...base, password_confirm: 'longenougH' });
		expect(messages(result)).toEqual({ password_confirm: ["The passwords don't match."] });
	});

	it('requires the confirmation: leaving it out is a mismatch on the confirm field', () => {
		const result = signupSchema.safeParse({ ...base, password_confirm: undefined });
		expect(messages(result).password_confirm).toEqual(["The passwords don't match."]);
	});

	it('checks the confirmation alongside the other fields', () => {
		const result = signupSchema.safeParse({
			...base,
			birth_month: '',
			password_confirm: 'different'
		});
		expect(messages(result)).toEqual({
			birth_month: ['Enter your birth month.'],
			password_confirm: ["The passwords don't match."]
		});
	});

	it('checks the names together alongside the other fields', () => {
		const result = signupSchema.safeParse({
			...base,
			email: 'nope',
			first_name: 'é'.repeat(30),
			last_name: 'é'.repeat(34)
		});
		expect(messages(result)).toEqual({
			email: ['Enter a valid email address.'],
			last_name: ['Your first and last name together can be at most 63 characters.']
		});
	});

	it.each(['', 'other', undefined])('asks for man or woman when the gender is %j', (gender) => {
		const result = signupSchema.safeParse({ ...base, gender_division: gender });
		expect(messages(result)).toEqual({ gender_division: ['Choose man or woman.'] });
	});

	it('takes womens', () => {
		const result = signupSchema.safeParse({ ...base, gender_division: 'womens' });
		expect(result.success && result.data.gender_division).toBe('womens');
	});

	it('checks every field in one pass', () => {
		const result = signupSchema.safeParse({
			birth_month: '',
			birth_year: '',
			gender_division: '',
			first_name: '',
			last_name: '',
			city: { text: 'x', chosen: null },
			email: '',
			password: '',
			password_confirm: 'z'
		});
		expect(Object.keys(messages(result)).sort()).toEqual(
			[
				'accepted_privacy',
				'accepted_terms',
				'birth_month',
				'birth_year',
				'city',
				'email',
				'first_name',
				'gender_division',
				'last_name',
				'password',
				'password_confirm'
			].sort()
		);
	});
});

describe('birthMonthSchema', () => {
	it.each([
		['1', 1],
		['12', 12],
		[' 6 ', 6]
	])('takes %j as %d', (input, month) => {
		expect(birthMonthSchema.parse(input)).toBe(month);
	});

	it.each(['', '   ', undefined])('asks for the month when it is %j', (input) => {
		const result = birthMonthSchema.safeParse(input);
		expect(!result.success && result.error.issues.map((issue) => issue.message)).toEqual([
			'Enter your birth month.'
		]);
	});

	it.each(['0', '13', '1.5', 'June', '-1'])('refuses %j', (input) => {
		const result = birthMonthSchema.safeParse(input);
		expect(!result.success && result.error.issues.map((issue) => issue.message)).toEqual([
			'Enter a month from 1 to 12.'
		]);
	});
});

describe('birthYearSchema', () => {
	const thisYear = new Date().getFullYear();

	it.each([
		['1990', 1990],
		['1900', 1900],
		[` ${thisYear} `, thisYear]
	])('takes %j as %d', (input, year) => {
		expect(birthYearSchema.parse(input)).toBe(year);
	});

	it.each(['', '  ', 'abcd', '19x0', '1990.5', undefined])(
		'asks for the year when it is %j',
		(input) => {
			const result = birthYearSchema.safeParse(input);
			expect(!result.success && result.error.issues.map((issue) => issue.message)).toEqual([
				'Enter your birth year.'
			]);
		}
	);

	it('refuses a year before 1900', () => {
		const result = birthYearSchema.safeParse('1899');
		expect(!result.success && result.error.issues.map((issue) => issue.message)).toEqual([
			'Enter a birth year of 1900 or later.'
		]);
	});

	it('refuses a year that has not come yet', () => {
		const result = birthYearSchema.safeParse(String(thisYear + 1));
		expect(!result.success && result.error.issues.map((issue) => issue.message)).toEqual([
			'Enter a birth year that has passed.'
		]);
	});

	it('takes a recent year: the backend decides the minimum age', () => {
		expect(birthYearSchema.parse(String(thisYear - 5))).toBe(thisYear - 5);
	});
});

describe('email format', () => {
	it.each(['sam@localhost', 'sam@example.co', 'sam@example.xn--p1ai', 'sam@my-host.example.org'])(
		'accepts %j',
		(email) => {
			expect(emailSchema.safeParse(email).success).toBe(true);
		}
	);

	it.each([
		'sam@example.c',
		'sam@example.123',
		'sam@example.-com',
		'sam@example.com-',
		'sam@-example.com',
		'sam@example..com'
	])('refuses %j', (email) => {
		expect(emailSchema.safeParse(email).success).toBe(false);
	});
});

describe('password reset schemas', () => {
	// ADR 0003: the reset request finds the account by canonical address only.
	it('refuses a fullwidth address, which NFKC would fold onto an account', () => {
		const email = 'sam@\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45.org';
		expect(passwordResetRequestSchema.safeParse({ email }).success).toBe(false);
	});

	it('strips and lowercases a canonical address', () => {
		const result = passwordResetRequestSchema.safeParse({ email: ' Sam@Example.ORG ' });
		expect(result.success && result.data.email).toBe('sam@example.org');
	});

	it('takes an email to request a reset', () => {
		expect(passwordResetRequestSchema.safeParse({ email: 'sam@example.org' }).success).toBe(true);
		expect(passwordResetRequestSchema.safeParse({ email: 'x' }).success).toBe(false);
	});

	it('takes a key and a new password to reset', () => {
		expect(passwordResetSchema.safeParse({ key: 'abc-123', password: 'longenough' }).success).toBe(
			true
		);
		expect(passwordResetSchema.safeParse({ key: '', password: 'longenough' }).success).toBe(false);
		expect(passwordResetSchema.safeParse({ key: 'abc-123', password: 'short' }).success).toBe(
			false
		);
	});
});
