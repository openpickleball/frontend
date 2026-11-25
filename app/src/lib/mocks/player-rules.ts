/**
 * The backend's rules for a player's profile, shared by sign-up and `me/player`. Read from
 * `apps/players/models.py`, `schemas.py` and `age.py`.
 *
 * `me/player` checks a body in two steps, as the backend does: the schema first (pydantic:
 * unknown keys, types, set-once fields, privacy values), then the model (`Player.clean_fields`
 * and its rules: stripped text, lengths, the display name, the gender division, the age).
 */
import type { components } from '../api/generated/open';
import type { FieldIssue } from './store';

type Schemas = components['schemas'];
export type PlayerCreateIn = Schemas['PlayerCreateIn'];
export type PlayerUpdateIn = Schemas['PlayerUpdateIn'];
export type PrivacyOut = Schemas['PrivacyOut'];

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

/**
 * The backend's `starting_display_name` for a player aged 13 to 17: "First L.", with the last
 * name's first character that renders and the combining marks after it.
 */
export function minorDisplayName(first: string, last: string): string {
	const chars = [...last];
	const found = chars.findIndex((char) => hasVisibleCharacter(char));
	const start = found === -1 ? 0 : found;
	let end = start + 1;
	while (end < chars.length && /\p{M}/u.test(chars[end])) end += 1;
	return `${first} ${chars.slice(start, end).join('')}.`;
}

/**
 * At least 13, as backend `apps/players/age.py` counts it: born on the last day of the birth
 * month, on today's date at UTC-12 (the earliest date on Earth).
 */
export function isOldEnough(year: number, month: number, now = new Date()): boolean {
	return ageOn(year, month, now) >= 13;
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
const STRING_FIELDS = [...Object.keys(TEXT_LIMITS), 'gender_division'];
const BIRTH_FIELDS = ['birth_year', 'birth_month'];
export const GENDER_DIVISIONS = ['mens', 'womens'] as const;
export const VISIBILITIES = ['signed_in', 'private'] as const;
export const PRIVACY_SETTINGS: readonly (keyof PrivacyOut)[] = [
	'city_region_visibility',
	'match_history_visibility',
	'rating_history_visibility',
	'stats_visibility',
	'home_club_visibility'
];

const CREATE_KEYS = new Set([...STRING_FIELDS, ...BIRTH_FIELDS]);
const UPDATE_KEYS = new Set([...Object.keys(TEXT_LIMITS), 'privacy']);
const SET_ONCE: Record<string, string> = {
	birth_year: "Your birth year and month can't be changed.",
	birth_month: "Your birth year and month can't be changed.",
	gender_division: "Your gender division can't be changed."
};

/** `_MISSING_DETAIL_MESSAGES`: what the create needs when no sign-up details are held. */
export const REQUIRED_TO_CREATE = {
	display_name: 'Enter a display name.',
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
				else if (value !== null && !VISIBILITIES.includes(value as never)) {
					issues.push(issue(field, 'enum', "Input should be 'signed_in' or 'private'"));
				}
			}
		}
	}
	for (const key of Object.keys(rest)) if (!UPDATE_KEYS.has(key)) issues.push(extra(`body.${key}`));
	return issues;
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
			else {
				issues.push(issue(field, 'null', 'This field cannot be null.'));
				issues.push(issue(field, 'invalid', REQUIRED_TO_CREATE.display_name));
			}
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
		if (name === 'display_name' && !hasVisibleCharacter(stripped)) {
			issues.push(issue(field, 'invalid', REQUIRED_TO_CREATE.display_name));
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
