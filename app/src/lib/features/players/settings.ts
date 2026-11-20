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
