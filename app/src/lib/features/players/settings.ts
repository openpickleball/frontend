import type { PrivacyKey } from './types.js';

/** The backend's `Player.display_name` max_length, counted after trimming. */
export const DISPLAY_NAME_MAX = 64;

/** The privacy settings in the order the profile lists them, with their labels. */
export const PRIVACY_ROWS: readonly { key: PrivacyKey; label: string }[] = [
	{ key: 'match_history', label: 'Match history' },
	{ key: 'stats', label: 'Stats' },
	{ key: 'rating_history', label: 'Rating history' },
	{ key: 'home_club', label: 'Home club' },
	{ key: 'city_region', label: 'City and region' }
];

export type NameCheck = { ok: true; value: string } | { ok: false; message: string };

/**
 * A quick check before saving, so the player hears about an empty or long name at once.
 * The backend checks the name again and has more rules; its message wins.
 */
export function checkDisplayName(raw: string): NameCheck {
	const value = raw.trim();
	if (value === '') return { ok: false, message: 'Enter a display name.' };
	// Count code points, as the backend does, not UTF-16 units.
	if ([...value].length > DISPLAY_NAME_MAX) {
		return { ok: false, message: `Use ${DISPLAY_NAME_MAX} characters or fewer.` };
	}
	return { ok: true, value };
}

/** The details form's values, as typed. Each one is a form field name, as the backend names it. */
export type DetailValues = {
	birth_month: string;
	birth_year: string;
	gender_division: string;
	display_name: string;
};

/** The body `POST me/player` takes when the backend holds no sign-up details. */
export type DetailBody = {
	birth_month: number;
	birth_year: number;
	gender_division: string;
	display_name: string;
};

export type DetailsCheck =
	| { ok: true; value: DetailBody }
	| { ok: false; errors: Partial<Record<keyof DetailValues, string>> };

/**
 * A quick check before the details are sent, with the backend's own messages for a missing
 * value. The backend checks them again, and its messages win.
 */
export function checkDetails(values: DetailValues): DetailsCheck {
	const errors: Partial<Record<keyof DetailValues, string>> = {};
	const year = values.birth_year.trim();
	if (values.birth_month === '') errors.birth_month = 'Enter your birth month.';
	if (year === '') errors.birth_year = 'Enter your birth year.';
	else if (!/^\d+$/.test(year)) errors.birth_year = 'Enter a whole number.';
	if (values.gender_division === '') errors.gender_division = 'Choose a gender division.';
	const name = checkDisplayName(values.display_name);
	if (!name.ok) errors.display_name = name.message;
	if (Object.keys(errors).length > 0 || !name.ok) return { ok: false, errors };
	return {
		ok: true,
		value: {
			birth_month: Number(values.birth_month),
			birth_year: Number(year),
			gender_division: values.gender_division,
			display_name: name.value
		}
	};
}
