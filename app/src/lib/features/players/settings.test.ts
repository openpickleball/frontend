import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, PRIVACY_ROWS, checkDisplayName } from './settings.js';

describe('checkDisplayName', () => {
	it('trims the name', () => {
		expect(checkDisplayName('  Fern Mock  ')).toEqual({ ok: true, value: 'Fern Mock' });
	});

	it('refuses an empty or blank name', () => {
		expect(checkDisplayName('')).toEqual({ ok: false, message: 'Enter a display name.' });
		expect(checkDisplayName('   ')).toEqual({ ok: false, message: 'Enter a display name.' });
	});

	it('allows the longest name and refuses one more character', () => {
		const longest = 'a'.repeat(DISPLAY_NAME_MAX);
		expect(checkDisplayName(longest)).toEqual({ ok: true, value: longest });
		expect(checkDisplayName(`${longest}a`)).toEqual({
			ok: false,
			message: 'Use 64 characters or fewer.'
		});
	});

	it('counts characters, not UTF-16 units, as the backend does', () => {
		// Each of these is one character and two UTF-16 units.
		const name = '\u{1F3D3}'.repeat(DISPLAY_NAME_MAX);
		expect(name.length).toBe(DISPLAY_NAME_MAX * 2);
		expect(checkDisplayName(name).ok).toBe(true);
	});
});

describe('PRIVACY_ROWS', () => {
	it('lists each privacy setting once', () => {
		const keys = PRIVACY_ROWS.map((row) => row.key);
		expect(new Set(keys).size).toBe(5);
		expect(keys).toEqual(
			expect.arrayContaining([
				'match_history',
				'stats',
				'rating_history',
				'home_club',
				'city_region'
			])
		);
	});
});
