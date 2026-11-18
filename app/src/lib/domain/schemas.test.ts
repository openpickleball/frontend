/**
 * The email cases are ported from backend `apps/accounts/tests/test_canonical_email.py`
 * and `test_headless_email_rules.py`. The password minimum is Django's default
 * `MinimumLengthValidator` (8), which `config/settings.py` lists with no options.
 */
import { describe, expect, it } from 'vitest';
import { buildCode } from './codes';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	emailSchema,
	loginSchema,
	matchInputSchema,
	normalizeEmail,
	passwordResetRequestSchema,
	passwordResetSchema,
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
		expect(!floats.success && Object.keys(zodFieldErrors(floats.error))).toEqual([
			'games.0.team_a'
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

describe('signupSchema and password rules', () => {
	const email = 'sam@example.org';

	it('uses the backend minimum of 8 characters', () => {
		expect(PASSWORD_MIN_LENGTH).toBe(8);
		expect(signupSchema.safeParse({ email, password: 'a'.repeat(7) }).success).toBe(false);
		expect(signupSchema.safeParse({ email, password: 'a'.repeat(8) }).success).toBe(true);
	});

	it('names the minimum in the message', () => {
		const result = signupSchema.safeParse({ email, password: 'short' });
		expect(!result.success && zodFieldErrors(result.error)).toEqual({
			password: ['Use at least 8 characters.']
		});
	});

	it('keys email issues under email', () => {
		const result = signupSchema.safeParse({ email: 'nope', password: 'longenough' });
		expect(!result.success && zodFieldErrors(result.error)).toEqual({
			email: ['Enter a valid email address.']
		});
	});

	it('normalizes the email', () => {
		const result = signupSchema.safeParse({ email: ' Sam@Example.org ', password: 'longenough' });
		expect(result.success && result.data.email).toBe('sam@example.org');
	});

	it('does not trim the password', () => {
		const result = signupSchema.safeParse({ email, password: '  spaces  ' });
		expect(result.success && result.data.password).toBe('  spaces  ');
	});
});

describe('password reset schemas', () => {
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
