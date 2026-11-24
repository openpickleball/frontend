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
export const genderDivisionSchema = z.enum(['mens', 'womens'], 'Choose man or woman.');

/**
 * The longest first name the backend takes, and the longest `${first} ${last}`, counted in
 * code points. Backend `apps/accounts/forms.py`. The pair limit of 64 includes the space, so
 * the message says 63.
 */
export const SIGNUP_FIRST_NAME_MAX_LENGTH = 61;
export const SIGNUP_NAME_MAX_LENGTH = 64;

/** Length in code points, as the backend counts it (not UTF-16 units). */
function codePoints(text: string): number {
	return [...text].length;
}

/** The first name, stripped. Empty or too long is an issue. */
const firstNameSchema = z
	.string('Enter your first name.')
	.transform((text) => text.trim())
	.superRefine((text, ctx) => {
		if (!text) {
			ctx.addIssue({ code: 'custom', message: 'Enter your first name.' });
		} else if (codePoints(text) > SIGNUP_FIRST_NAME_MAX_LENGTH) {
			ctx.addIssue({
				code: 'custom',
				message: `Your first name can be at most ${SIGNUP_FIRST_NAME_MAX_LENGTH} characters.`
			});
		}
	});

/** The last name, stripped. The pair's length is checked on the whole form. */
const lastNameSchema = z
	.string('Enter your last name.')
	.transform((text) => text.trim())
	.refine((text) => text !== '', 'Enter your last name.');

type NameFields = { first_name?: unknown; last_name?: unknown };

/** Do the two names fit together? Only checked when both are strings. */
const namesFit = (value: NameFields): boolean =>
	typeof value.first_name !== 'string' ||
	typeof value.last_name !== 'string' ||
	codePoints(`${value.first_name.trim()} ${value.last_name.trim()}`) <= SIGNUP_NAME_MAX_LENGTH;

/**
 * Check the two names together, as the backend does: only when both are given and the first
 * name alone is fine. Runs even when another field fails, so every message shows at once.
 */
const namesTogether = {
	message: `Your first and last name together can be at most ${SIGNUP_NAME_MAX_LENGTH - 1} characters.`,
	path: ['last_name'],
	when: ({ value }: { value: unknown }) => {
		const { first_name, last_name } = (value ?? {}) as NameFields;
		if (typeof first_name !== 'string' || typeof last_name !== 'string') return false;
		const first = first_name.trim();
		return (
			first !== '' && last_name.trim() !== '' && codePoints(first) <= SIGNUP_FIRST_NAME_MAX_LENGTH
		);
	}
};

/** What the form holds for the optional city: the typed text and the suggestion picked, if any. */
export type CityInput = { text: string; chosen: { city: string; region: string } | null };

/**
 * The optional city. A picked suggestion gives `city` and `region`. Empty text gives neither.
 * Text without a picked suggestion is an issue: only a place from the list is sent.
 */
const citySchema = z
	.object({
		text: z.string().optional(),
		chosen: z.object({ city: z.string(), region: z.string() }).nullable().optional()
	})
	.optional()
	.transform((input, ctx): { city?: string; region?: string } => {
		if (input?.chosen) return { city: input.chosen.city, region: input.chosen.region };
		if (!(input?.text ?? '').trim()) return {};
		ctx.addIssue({
			code: 'custom',
			message: 'Choose your city from the list, or clear the field.'
		});
		return z.NEVER;
	});

/** An agreement: only `true` accepts. */
const agreement = (message: string) =>
	z
		.boolean(message)
		.refine((value) => value === true, message)
		.transform((): true => true);

const accountShape = {
	email: emailSchema,
	password: newPasswordSchema,
	password_confirm: z.string("The passwords don't match.")
};

const detailsShape = {
	birth_month: birthMonthSchema,
	birth_year: birthYearSchema,
	gender_division: genderDivisionSchema,
	first_name: firstNameSchema,
	last_name: lastNameSchema,
	city: citySchema,
	accepted_terms: agreement('Accept the Terms of Service.'),
	accepted_privacy: agreement('Accept the Privacy Policy.')
};

const passwordsMatch = {
	message: "The passwords don't match.",
	path: ['password_confirm'],
	// Also check it when another field is wrong, so every message shows at once.
	when: ({ value }: { value: unknown }) => {
		const { password, password_confirm } = (value ?? {}) as Record<string, unknown>;
		return typeof password === 'string' && typeof password_confirm === 'string';
	}
};

/** Step 1 of sign-up: the account. `password_confirm` is a typo guard and is not in the output. */
export const signupAccountSchema = z
	.object(accountShape)
	.refine((input) => input.password_confirm === input.password, passwordsMatch)
	.transform(({ email, password }) => ({ email, password }));

/** The age screen: birth month and year as numbers. The backend decides who can sign up. */
export const signupAgeSchema = z.object({
	birth_month: birthMonthSchema,
	birth_year: birthYearSchema
});

type DetailsParsed = {
	birth_month: number;
	birth_year: number;
	gender_division: 'mens' | 'womens';
	first_name: string;
	last_name: string;
	city: { city?: string; region?: string };
	accepted_terms: true;
	accepted_privacy: true;
};

/** Puts `city` and `region` at the top level, and leaves the keys out when there is none. */
function flattenCity(input: DetailsParsed) {
	// Named keys only, so anything else on the input (such as a password confirmation) is left out.
	return {
		birth_year: input.birth_year,
		birth_month: input.birth_month,
		gender_division: input.gender_division,
		first_name: input.first_name,
		last_name: input.last_name,
		...input.city,
		accepted_terms: input.accepted_terms,
		accepted_privacy: input.accepted_privacy
	};
}

/** The details screen: age, gender, names, optional city and the two agreements. */
export const signupDetailsSchema = z
	.object(detailsShape)
	.refine(namesFit, namesTogether)
	.transform(flattenCity);

/** The whole sign-up, for the final send. The output is exactly the request body. */
export const signupSchema = z
	.object({ ...accountShape, ...detailsShape })
	.refine((input) => input.password_confirm === input.password, passwordsMatch)
	.refine(namesFit, namesTogether)
	.transform((input) => ({ email: input.email, password: input.password, ...flattenCity(input) }));

export const loginSchema = z.object({ email: canonicalEmailSchema, password: loginPasswordSchema });
export const passwordResetRequestSchema = z.object({ email: canonicalEmailSchema });
export const passwordResetSchema = z.object({
	key: z.string('The reset link is not valid.').min(1, 'The reset link is not valid.'),
	password: newPasswordSchema
});

export type SignupInput = z.input<typeof signupSchema>;
export type SignupAccountInput = z.input<typeof signupAccountSchema>;
export type SignupDetailsInput = z.input<typeof signupDetailsSchema>;
export type SignupAgeInput = z.input<typeof signupAgeSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.input<typeof passwordResetSchema>;
