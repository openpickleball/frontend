import { birthYearSchema, playerNamesSchema } from '#lib/domain/index.js';
import type { SwitchKey } from './types.js';

/**
 * The privacy settings a player can switch either way, in the order the profile lists them,
 * with their labels. Current ratings (`rating`) have their own row, because of their rules.
 */
export const PRIVACY_ROWS: readonly { key: SwitchKey; label: string }[] = [
	{ key: 'match_history', label: 'Match history' },
	{ key: 'stats', label: 'Stats' },
	{ key: 'rating_history', label: 'Rating history' },
	{ key: 'home_club', label: 'Home club' },
	{ key: 'city_region', label: 'City and region' }
];

/** The details form's values, as typed. Each one is a form field name, as the backend names it. */
export type DetailValues = {
	birth_month: string;
	birth_year: string;
	gender_division: string;
	first_name: string;
	last_name: string;
};

/** The body `POST me/player` takes when the backend holds no sign-up details. */
export type DetailBody = {
	birth_month: number;
	birth_year: number;
	gender_division: string;
	first_name: string;
	last_name: string;
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
	if (values.birth_month === '') errors.birth_month = 'Enter your birth month.';
	// Signup's rule, 1900 to this year: a future year would get the backend's age refusal,
	// which holds for the rest of the session.
	const year = birthYearSchema.safeParse(values.birth_year);
	if (!year.success) errors.birth_year = year.error.issues[0]?.message ?? 'Enter your birth year.';
	if (values.gender_division === '') errors.gender_division = 'Choose a gender division.';
	// Signup's name rules and messages: the backend checks the body's names with the same ones.
	const names = playerNamesSchema.safeParse({
		first_name: values.first_name,
		last_name: values.last_name
	});
	if (!names.success) {
		for (const issue of names.error.issues) {
			const field = issue.path[0] as 'first_name' | 'last_name';
			errors[field] ??= issue.message;
		}
	}
	if (Object.keys(errors).length > 0 || !names.success || !year.success) {
		return { ok: false, errors };
	}
	return {
		ok: true,
		value: {
			birth_month: Number(values.birth_month),
			birth_year: year.data,
			gender_division: values.gender_division,
			first_name: names.data.first_name,
			last_name: names.data.last_name
		}
	};
}
