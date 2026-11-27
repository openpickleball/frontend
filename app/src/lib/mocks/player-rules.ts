/**
 * The backend's rules for a player's profile, shared by sign-up and `me/player`. Read from
 * `apps/players/models.py`, `schemas.py` and `age.py`.
 *
 * `me/player` checks a body in two steps, as the backend does: the schema first (pydantic:
 * unknown keys, types, set-once fields, privacy values), then the model (`Player.clean_fields`
 * and its rules: stripped text, lengths, the gender division, the age). The create's body path
 * checks the first and last name with signup's rules first, and the display name and legal name
 * are built from them, never sent (ADR 0062).
 */
import type { components } from '../api/generated/open';
import { SIGNUP_FIRST_NAME_MAX_LENGTH, SIGNUP_NAME_MAX_LENGTH } from '../domain/schemas';
import type { FieldIssue } from './store';

type Schemas = components['schemas'];
export type PlayerCreateIn = Schemas['PlayerCreateIn'];
export type PlayerUpdateIn = Schemas['PlayerUpdateIn'];
export type PrivacyOut = Schemas['PrivacyOut'];
export type NameFormat = Schemas['NameFormat'];

export const NOT_TEXT = 'Enter text.';
export const CONTROL_CHARACTER = 'Remove control or invalid characters.';

/**
 * Close to Python's `str.strip()`: JS whitespace (`\s`), plus the separators U+001C to U+001F and
 * U+0085 that Python strips and `\s` leaves out. Unlike Python, `\s` also strips U+FEFF.
 */
export const strip = (value: string): string =>
	// eslint-disable-next-line no-control-regex -- Python's strip() also removes these separators
	value.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/g, '');

/** Lengths are Python code points, so count the same way. */
export const codePoints = (value: string): number => [...value].length;

export const hasControlCharacter = (value: string): boolean =>
	// eslint-disable-next-line no-control-regex -- the backend refuses exactly these characters
	/[\u0000-\u001f\u007f-\u009f]/.test(value);

/** Characters that render blank although they are letters or symbols. */
const FILLERS = new Set(['ᅟ', 'ᅠ', 'ㅤ', 'ﾠ', '⠀', '\u{1d159}']);

/**
 * The backend's `has_visible_character`: a letter, number, punctuation mark or symbol, or an
 * unassigned character, other than a filler.
 */
export const hasVisibleCharacter = (value: string): boolean =>
	[...value].some((char) => /[\p{L}\p{N}\p{P}\p{S}\p{Cn}]/u.test(char) && !FILLERS.has(char));

/** The backend's `DISPLAY_NAME_MAX_LENGTH`, in code points. */
const DISPLAY_NAME_MAX = 64;

/**
 * The backend's `last_initial` (`apps/players/names.py`): the last name's first character that
 * renders, with the combining marks after it.
 */
function lastInitial(last: string): string[] {
	const chars = [...last];
	const found = chars.findIndex((char) => hasVisibleCharacter(char));
	const start = found === -1 ? 0 : found;
	let end = start + 1;
	while (end < chars.length && /\p{M}/u.test(chars[end])) end += 1;
	return chars.slice(start, end);
}

/**
 * The backend's `display_name_for` (`apps/players/names.py`): "First Last" for `full`, and
 * "First L." otherwise, so an unknown format fails closed. The initial's marks are dropped from
 * the end while the name would pass 64 characters, keeping at least its first character.
 */
export function displayNameFor(first: string, last: string, format: NameFormat): string {
	if (format === 'full') return `${first} ${last}`;
	const room = DISPLAY_NAME_MAX - codePoints(first) - 2;
	return `${first} ${lastInitial(last).slice(0, Math.max(room, 1)).join('')}.`;
}

/** The backend's `FULL_NAME_FROM_18_MESSAGE`. */
export const FULL_NAME_FROM_18 = 'Your full last name can be shown only from age 18.';

/** A name refused by signup's checks, on the field that holds it. */
export type NameIssue = { code: string; message: string; param: 'first_name' | 'last_name' };

/** A required name: stripped, then required, control characters, and its own length. */
function nameCheck(
	value: unknown,
	param: 'first_name' | 'last_name',
	requiredMessage: string
): { issue: NameIssue | null; value: string } {
	if (value === undefined || value === null) {
		return { issue: { code: 'required', message: requiredMessage, param }, value: '' };
	}
	if (typeof value !== 'string') {
		return { issue: { code: 'invalid', message: NOT_TEXT, param }, value: '' };
	}
	const stripped = strip(value);
	// The control-character check comes first, as in the backend.
	if (hasControlCharacter(stripped)) {
		return { issue: { code: 'invalid', message: CONTROL_CHARACTER, param }, value: stripped };
	}
	if (!hasVisibleCharacter(stripped)) {
		return { issue: { code: 'required', message: requiredMessage, param }, value: '' };
	}
	return { issue: null, value: stripped };
}

/**
 * Signup's checks on a first and last name (`PlayerNamesForm` and the signup form, in
 * `apps/accounts/forms.py`): each name, then the first name's limit, then the two together.
 * Returns the stripped names with the issues.
 */
export function signupNameIssues(body: Record<string, unknown>): {
	issues: NameIssue[];
	first: string;
	last: string;
} {
	const issues: NameIssue[] = [];
	const first = nameCheck(body.first_name, 'first_name', 'Enter your first name.');
	const last = nameCheck(body.last_name, 'last_name', 'Enter your last name.');
	const firstTooLong = !first.issue && codePoints(first.value) > SIGNUP_FIRST_NAME_MAX_LENGTH;
	if (first.issue) issues.push(first.issue);
	else if (firstTooLong) {
		issues.push({
			code: 'max_length',
			message: `Your first name can be at most ${SIGNUP_FIRST_NAME_MAX_LENGTH} characters.`,
			param: 'first_name'
		});
	}
	if (last.issue) issues.push(last.issue);
	else if (
		!first.issue &&
		!firstTooLong &&
		codePoints(`${first.value} ${last.value}`) > SIGNUP_NAME_MAX_LENGTH
	) {
		issues.push({
			code: 'max_length',
			message: `Your first and last name together can be at most ${SIGNUP_NAME_MAX_LENGTH - 1} characters.`,
			param: 'last_name'
		});
	}
	return { issues, first: first.value, last: last.value };
}

/**
 * At least 13, as backend `apps/players/age.py` counts it: born on the last day of the birth
 * month, on today's date at UTC-12 (the earliest date on Earth).
 */
export function isOldEnough(year: number, month: number, now = new Date()): boolean {
	return ageOn(year, month, now) >= 13;
}

/**
 * The backend's `is_name_format_locked` (`apps/players/services.py`): true while the player is
 * 13 to 17, and also when the birth year or month is missing, not a whole number or the month
 * is outside 1 to 12, so it fails closed. A new player whose format is locked starts with
 * `first_last_initial` (`_starting_name_format`).
 */
export function isNameFormatLocked(year: unknown, month: unknown, now = new Date()): boolean {
	if (!Number.isInteger(year) || !Number.isInteger(month)) return true;
	const [y, m] = [year as number, month as number];
	if (m < 1 || m > 12) return true;
	return isMinor(y, m, now);
}

/** `is_minor`: 13 to 17, counted the same way as `isOldEnough`. */
export function isMinor(year: number, month: number, now = new Date()): boolean {
	const age = ageOn(year, month, now);
	return age >= 13 && age < 18;
}

/** Whole years old, from the last day of the birth month, on today's date at UTC-12. */
function ageOn(year: number, month: number, now: Date): number {
	const today = new Date(now.getTime() - 12 * 60 * 60 * 1000);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const [todayMonth, todayDay] = [today.getUTCMonth() + 1, today.getUTCDate()];
	let age = today.getUTCFullYear() - year;
	if (todayMonth < month || (todayMonth === month && todayDay < lastDay)) age -= 1;
	return age;
}

/** `_birth_month_is_in_the_future`: after this month, on the server's date. */
export function isFutureMonth(year: number, month: number, now = new Date()): boolean {
	const [thisYear, thisMonth] = [now.getFullYear(), now.getMonth() + 1];
	return year > thisYear || (year === thisYear && month > thisMonth);
}

/** The fixed age refusal (`UNDER_MINIMUM_AGE_MESSAGE`), for under 13 and the future alike. */
export const AGE_REFUSAL: FieldIssue = {
	field: 'body.birth_month',
	code: 'invalid',
	message: "This birth year and month can't be used."
};

const TEXT_LIMITS = { display_name: 64, legal_name: 200, city: 100, region: 100 } as const;
type TextField = keyof typeof TEXT_LIMITS;
const OPTIONAL_TEXT: readonly TextField[] = ['legal_name', 'city', 'region'];
const STRING_FIELDS = ['first_name', 'last_name', 'city', 'region', 'gender_division'];
const BIRTH_FIELDS = ['birth_year', 'birth_month'];
export const GENDER_DIVISIONS = ['mens', 'womens'] as const;
export const VISIBILITIES = ['signed_in', 'private'] as const;
export const NAME_FORMATS = ['full', 'first_last_initial'] as const;
export const PRIVACY_SETTINGS: readonly (keyof PrivacyOut)[] = [
	'city_region_visibility',
	'match_history_visibility',
	'rating_history_visibility',
	'stats_visibility',
	'home_club_visibility',
	'rating_visibility',
	'name_format'
];

export const RATINGS_ALWAYS_SHOWN =
	"Current ratings are always shown to signed-in players and can't be hidden.";
export const RATINGS_SHOWN_FROM_18 =
	'Current ratings can be shown to other players only from age 18.';

const CREATE_KEYS = new Set([...STRING_FIELDS, ...BIRTH_FIELDS]);
const UPDATE_KEYS = new Set(['city', 'region', 'privacy']);
/**
 * The backend's `SET_ONCE_MESSAGES`. The display name and legal name are built from the names
 * given at signup (ADR 0062), so they are refused like the others.
 */
const SET_ONCE: Record<string, string> = {
	display_name: "Your display name can't be changed.",
	legal_name: "Your legal name can't be changed.",
	birth_year: "Your birth year and month can't be changed.",
	birth_month: "Your birth year and month can't be changed.",
	gender_division: "Your gender division can't be changed."
};

/** `_MISSING_DETAIL_MESSAGES`: what the create needs when no sign-up details are held. */
export const REQUIRED_TO_CREATE = {
	first_name: 'Enter your first name.',
	last_name: 'Enter your last name.',
	birth_year: 'Enter your birth year.',
	birth_month: 'Enter your birth month.',
	gender_division: 'Choose a gender division.'
} as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const issue = (field: string, code: string, message: string): FieldIssue => ({
	field,
	code,
	message
});

const notObject = (field: string) =>
	issue(
		field,
		'model_attributes_type',
		'Input should be a valid dictionary or object to extract fields from'
	);

const extra = (field: string) => issue(field, 'extra_forbidden', 'Extra inputs are not permitted');

function typeIssues(body: Record<string, unknown>): FieldIssue[] {
	const issues: FieldIssue[] = [];
	for (const [key, value] of Object.entries(body)) {
		if (value === null) continue;
		if (STRING_FIELDS.includes(key) && typeof value !== 'string') {
			issues.push(issue(`body.${key}`, 'string_type', 'Input should be a valid string'));
		}
		if (BIRTH_FIELDS.includes(key) && !(typeof value === 'number' && Number.isInteger(value))) {
			issues.push(issue(`body.${key}`, 'int_type', 'Input should be a valid integer'));
		}
	}
	return issues;
}

/** `PlayerCreateIn` (pydantic): unknown keys, text and strict integers. */
export function createSchemaIssues(body: unknown): FieldIssue[] {
	if (!isObject(body)) return [notObject('body')];
	const issues = typeIssues(body);
	for (const key of Object.keys(body)) if (!CREATE_KEYS.has(key)) issues.push(extra(`body.${key}`));
	return issues;
}

/**
 * `PlayerUpdateIn` (pydantic): set-once fields refused whatever the value, then the rest. Keys
 * are checked as own keys only, so a name on `Object.prototype` (`toString`, `__proto__`) is an
 * unknown key like any other.
 */
export function updateSchemaIssues(body: unknown): FieldIssue[] {
	if (!isObject(body)) return [notObject('body')];
	const issues: FieldIssue[] = [];
	for (const [key, message] of Object.entries(SET_ONCE)) {
		if (Object.hasOwn(body, key)) issues.push(issue(`body.${key}`, 'set_once', message));
	}
	const rest = Object.fromEntries(
		Object.entries(body).filter(([key]) => !Object.hasOwn(SET_ONCE, key))
	);
	issues.push(...typeIssues(rest));
	const privacy = body.privacy;
	if (privacy !== undefined && privacy !== null) {
		if (!isObject(privacy)) issues.push(notObject('body.privacy'));
		else {
			for (const [key, value] of Object.entries(privacy)) {
				const field = `body.privacy.${key}`;
				if (!PRIVACY_SETTINGS.includes(key as keyof PrivacyOut)) issues.push(extra(field));
				else if (key === 'name_format') {
					if (value !== null && !NAME_FORMATS.includes(value as never)) {
						issues.push(issue(field, 'enum', "Input should be 'full' or 'first_last_initial'"));
					}
				} else if (value !== null && !VISIBILITIES.includes(value as never)) {
					issues.push(issue(field, 'enum', "Input should be 'signed_in' or 'private'"));
				}
			}
		}
	}
	for (const key of Object.keys(rest)) if (!UPDATE_KEYS.has(key)) issues.push(extra(`body.${key}`));
	return issues;
}

/**
 * The backend's rule for `rating_visibility` (`_refuse_rating_visibility`), checked before the
 * other privacy settings. The stored value is always accepted. Hiding current ratings is refused
 * for everyone, and showing them is refused for a player aged 13 to 17.
 */
export function ratingVisibilityIssues(
	stored: PrivacyOut['rating_visibility'],
	minor: boolean,
	privacy: unknown
): FieldIssue[] {
	if (!isObject(privacy) || !Object.hasOwn(privacy, 'rating_visibility')) return [];
	const value = privacy.rating_visibility;
	const field = 'body.privacy.rating_visibility';
	if (value === stored) return [];
	if (value === 'private') return [issue(field, 'invalid', RATINGS_ALWAYS_SHOWN)];
	if (value === 'signed_in' && minor) return [issue(field, 'invalid', RATINGS_SHOWN_FROM_18)];
	return [];
}

/**
 * The backend's rule for `name_format` (`_refuse_name_format`): the stored value is always
 * accepted, and `full` is refused while the name format is locked (13 to 17).
 */
export function nameFormatIssues(
	stored: NameFormat,
	locked: boolean,
	privacy: unknown
): FieldIssue[] {
	if (!isObject(privacy) || !Object.hasOwn(privacy, 'name_format')) return [];
	const value = privacy.name_format;
	if (value === stored || value !== 'full' || !locked) return [];
	return [issue('body.privacy.name_format', 'invalid', FULL_NAME_FROM_18)];
}

/** The privacy model's check: a setting sent as null is refused, like any non-null column. */
export function privacyNullIssues(privacy: unknown): FieldIssue[] {
	if (!isObject(privacy)) return [];
	return Object.entries(privacy)
		.filter(([, value]) => value === null)
		.map(([key]) => issue(`body.privacy.${key}`, 'null', 'This field cannot be null.'));
}

/** The create's missing details (left out or null), in the backend's order. */
export function missingIssues(body: Record<string, unknown>): FieldIssue[] {
	return Object.entries(REQUIRED_TO_CREATE)
		.filter(([key]) => body[key] === undefined || body[key] === null)
		.map(([key, message]) => issue(`body.${key}`, 'missing', message));
}

export type ProfileValues = {
	display_name?: string | null;
	legal_name?: string | null;
	city?: string | null;
	region?: string | null;
	gender_division?: string | null;
	birth_year?: number;
	birth_month?: number;
};

/**
 * The model's checks on the fields given, after the schema passed: null clears an optional text
 * field, text is stripped, then control characters, lengths, the display name, the gender
 * division and the birth year and month. Returns the stored values, or the issues. The age is
 * left to the caller, which refuses the session for it.
 */
export function profileIssues(values: ProfileValues): {
	issues: FieldIssue[];
	clean: ProfileValues;
} {
	const issues: FieldIssue[] = [];
	const clean: ProfileValues = { ...values };
	for (const name of Object.keys(TEXT_LIMITS) as TextField[]) {
		if (!Object.hasOwn(values, name)) continue;
		const value = values[name];
		const field = `body.${name}`;
		if (value === null || value === undefined) {
			if (OPTIONAL_TEXT.includes(name)) clean[name] = '';
			else issues.push(issue(field, 'null', 'This field cannot be null.'));
			continue;
		}
		const stripped = strip(value);
		clean[name] = stripped;
		if (hasControlCharacter(stripped)) {
			issues.push(issue(field, 'invalid', CONTROL_CHARACTER));
			continue;
		}
		if (name === 'display_name' && stripped === '') {
			issues.push(issue(field, 'blank', 'This field cannot be blank.'));
		}
		const limit = TEXT_LIMITS[name];
		if (codePoints(stripped) > limit) {
			issues.push(
				issue(
					field,
					'max_length',
					`Ensure this value has at most ${limit} characters (it has ${codePoints(stripped)}).`
				)
			);
		}
	}
	if (Object.hasOwn(values, 'gender_division')) {
		const division = values.gender_division;
		if (division === '' || division === null || division === undefined) {
			issues.push(issue('body.gender_division', 'blank', REQUIRED_TO_CREATE.gender_division));
		} else if (!GENDER_DIVISIONS.includes(division as never)) {
			issues.push(
				issue('body.gender_division', 'invalid_choice', 'Choose one of the listed options.')
			);
		}
	}
	if (values.birth_year !== undefined && values.birth_year < 1900) {
		issues.push(
			issue('body.birth_year', 'min_value', 'Ensure this value is greater than or equal to 1900.')
		);
	}
	const month = values.birth_month;
	if (month !== undefined && (month < 1 || month > 12)) {
		const [code, message] =
			month < 1
				? ['min_value', 'Ensure this value is greater than or equal to 1.']
				: ['max_value', 'Ensure this value is less than or equal to 12.'];
		issues.push(issue('body.birth_month', code, message));
	}
	return { issues, clean };
}
