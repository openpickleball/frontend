/**
 * Zod 4 schemas for the forms: recording a match and the account forms.
 *
 * Field keys in the issues follow the backend's 422 `fields` once `body.` is
 * stripped (`team_a.0`, `games.1`, `played_on`), so a form can show a client-side
 * issue and a server-side one under the same key. Use `zodFieldErrors` to read them.
 *
 * A game's key can be `games.<i>` (a score rule) or `games.<i>.team_a` (the server's
 * schema check on one score), so a form groups game errors by the `games.<i>` prefix.
 */
import { z } from 'zod';
import { type BestOf, type GameTarget, type MatchFormat, type ScoringType } from './models';
import {
	groupIssues,
	validateMatch,
	type FieldErrors,
	type GameScore,
	type ValidatedMatch
} from './scores';

/** The names of the form's fields mapped to the backend's. Keys of any other shape pass through. */
const BACKEND_FIELD: Record<string, string> = {
	teamA: 'team_a',
	teamB: 'team_b',
	playedOn: 'played_on',
	bestOf: 'best_of',
	gameTarget: 'game_target',
	scoringType: 'scoring_type'
};

function backendKey(path: readonly PropertyKey[]): string {
	return path.map((segment) => BACKEND_FIELD[String(segment)] ?? String(segment)).join('.');
}

/** Groups a Zod error's messages by backend-style field key. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
	return groupIssues(
		error.issues.map((issue) => ({
			field: backendKey(issue.path),
			code: issue.code,
			message: issue.message
		}))
	);
}

/**
 * The form's shape, before the rules run. `bestOf`, `gameTarget` and `scoringType`
 * may be left out: the target defaults to 11, the scoring type to side-out and the
 * best-of is inferred from the games.
 */
export type MatchInput = {
	format: MatchFormat;
	/** `YYYY-MM-DD`. */
	playedOn: string;
	/** Player codes, in any spelling `parsePlayerCode` accepts. */
	teamA: readonly string[];
	teamB: readonly string[];
	games: readonly GameScore[];
	bestOf?: BestOf | null;
	gameTarget?: GameTarget | null;
	scoringType?: ScoringType | null;
};

/**
 * Parsing gives a `ValidatedMatch`: codes normalized, defaults applied, best-of
 * inferred. It runs the same rules as the backend (`validateMatch`).
 */
export const matchInputSchema = z
	.object({
		// The choices are checked by `validateMatch`, so their messages are the backend's.
		format: z.unknown().optional(),
		playedOn: z.string('Enter the date played as a date.'),
		// Also checked by `validateMatch`, so one bad value never hides the other issues.
		teamA: z.unknown().optional(),
		teamB: z.unknown().optional(),
		games: z.unknown().optional(),
		bestOf: z.unknown().optional(),
		gameTarget: z.unknown().optional(),
		scoringType: z.unknown().optional()
	})
	.transform((input, ctx): ValidatedMatch => {
		const result = validateMatch(input);
		if (!result.ok) {
			for (const issue of result.error) {
				ctx.addIssue({
					code: 'custom',
					message: issue.message,
					path: issue.field.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
					params: { code: issue.code }
				});
			}
			return z.NEVER;
		}
		return result.value;
	});

// Accounts

/** The longest email address the backend stores. `apps/accounts/validators.py`: `EMAIL_MAX_LENGTH`. */
export const EMAIL_MAX_LENGTH = 254;
/**
 * The shortest password the backend takes: Django's `MinimumLengthValidator`,
 * which `AUTH_PASSWORD_VALIDATORS` lists with no options, so 8. The backend also
 * refuses common and entirely numeric passwords and ones like the email address.
 * Only the server can check those, and its message is shown when it does.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** NFKC, strip, lowercase per character: `normalize_email_address` in the backend. */
export function normalizeEmail(email: string): string {
	return [...email.normalize('NFKC').trim()].map((c) => c.toLowerCase()).join('');
}

// Django's EmailValidator, reduced to what a browser can check.
const LOCAL_PART = String.raw`[-!#$%&'*+/=?^_\`{}|~0-9a-z]+(?:\.[-!#$%&'*+/=?^_\`{}|~0-9a-z]+)*`;
const LABEL = String.raw`[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`;
// The last label: letters or hyphens, 2 to 63, no leading or trailing hyphen, or `xn--`.
const TLD = String.raw`(?:[a-z](?:[a-z-]{0,61}[a-z])|xn--[a-z0-9-]{1,57}[a-z0-9])`;
const EMAIL_FORMAT = new RegExp(`^${LOCAL_PART}@(?:(?:${LABEL}\\.)+${TLD}|localhost)$`, 'i');

/** The first rule an already-normalized address breaks, in the backend's order: ASCII, length, format. */
export function emailError(normalized: string): string | null {
	// eslint-disable-next-line no-control-regex
	if (!/^[\u0000-\u007f]*$/.test(normalized)) {
		return 'Email addresses may contain only ASCII characters.';
	}
	if (normalized.length > EMAIL_MAX_LENGTH) {
		return `Email addresses may be at most ${EMAIL_MAX_LENGTH} characters.`;
	}
	if (!EMAIL_FORMAT.test(normalized)) return 'Enter a valid email address.';
	return null;
}

/** A new address for sign-up: normalized as the backend does (NFKC, strip, lowercase), then checked. */
export const emailSchema = z
	.string('Enter your email address.')
	.transform(normalizeEmail)
	.superRefine((email, ctx) => {
		const message = emailError(email);
		if (message) ctx.addIssue({ code: 'custom', message });
	});

/**
 * An address for logging in or requesting a password reset. The backend only recognizes a canonical address
 * (`is_canonical_email`): ASCII once stripped, so a lookalike that NFKC would fold
 * onto an account's address does not log in. This strips and lowercases but does
 * not apply NFKC.
 */
export const canonicalEmailSchema = z
	.string('Enter your email address.')
	.transform((email) => email.trim())
	.superRefine((email, ctx) => {
		const message = emailError(email);
		if (message) ctx.addIssue({ code: 'custom', message });
	})
	.transform((email) => [...email].map((c) => c.toLowerCase()).join(''));

/** A new password, for sign-up and a reset. Not trimmed. */
export const newPasswordSchema = z
	.string('Enter a password.')
	.min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`);

/** The password for logging in: only that something was typed. */
export const loginPasswordSchema = z.string('Enter your password.').min(1, 'Enter your password.');

/** The earliest birth year the backend takes. `apps/players/age.py`. */
export const BIRTH_YEAR_MIN = 1900;

/** The form's text, stripped, or `''` when the field was left out. */
const fieldText = z
	.string()
	.optional()
	.transform((text) => (text ?? '').trim());

/**
 * A birth month from the form's select: `'1'` to `'12'`, given as a number. The messages
 * match the backend's. Only the month and year are asked for (ADR 0017).
 */
export const birthMonthSchema = fieldText.transform((text, ctx) => {
	if (!text) {
		ctx.addIssue({ code: 'custom', message: 'Enter your birth month.' });
		return z.NEVER;
	}
	const month = /^\d+$/.test(text) ? Number(text) : NaN;
	if (!(month >= 1 && month <= 12)) {
		ctx.addIssue({ code: 'custom', message: 'Enter a month from 1 to 12.' });
		return z.NEVER;
	}
	return month;
});

/**
 * A birth year typed as text, given as a number: a whole number from 1900 to this year.
 * There is no minimum age here. The backend decides who can sign up.
 */
export const birthYearSchema = fieldText.transform((text, ctx) => {
	if (!/^\d+$/.test(text)) {
		ctx.addIssue({ code: 'custom', message: 'Enter your birth year.' });
		return z.NEVER;
	}
	const year = Number(text);
	if (year < BIRTH_YEAR_MIN) {
		ctx.addIssue({ code: 'custom', message: `Enter a birth year of ${BIRTH_YEAR_MIN} or later.` });
		return z.NEVER;
	}
	if (year > new Date().getFullYear()) {
		ctx.addIssue({ code: 'custom', message: 'Enter a birth year that has passed.' });
		return z.NEVER;
	}
	return year;
});

/** The division a player signs up for: the backend's `gender_division`. */
export const genderDivisionSchema = z.enum(['mens', 'womens'], 'Choose men or women.');

/**
 * Sign-up, in page order. `password_confirm` is a typo guard only: it must match `password`
 * and is not sent.
 */
export const signupSchema = z
	.object({
		birth_month: birthMonthSchema,
		birth_year: birthYearSchema,
		gender_division: genderDivisionSchema,
		email: emailSchema,
		password: newPasswordSchema,
		password_confirm: z.string().optional()
	})
	.refine((input) => input.password_confirm === input.password, {
		message: "The passwords don't match.",
		path: ['password_confirm'],
		// Also check it when another field is wrong, so every message shows at once.
		when: ({ value }) => {
			const { password, password_confirm } = (value ?? {}) as Record<string, unknown>;
			return typeof password === 'string' && typeof password_confirm === 'string';
		}
	})
	.transform(({ birth_month, birth_year, gender_division, email, password }) => ({
		birth_month,
		birth_year,
		gender_division,
		email,
		password
	}));
export const loginSchema = z.object({ email: canonicalEmailSchema, password: loginPasswordSchema });
export const passwordResetRequestSchema = z.object({ email: canonicalEmailSchema });
export const passwordResetSchema = z.object({
	key: z.string('The reset link is not valid.').min(1, 'The reset link is not valid.'),
	password: newPasswordSchema
});

export type SignupInput = z.input<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.input<typeof passwordResetSchema>;
