import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, PRIVACY_ROWS, checkDetails, checkDisplayName } from './settings.js';

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

describe('checkDetails', () => {
	const filled = {
		birth_month: '6',
		birth_year: ' 1990 ',
		gender_division: 'womens',
		display_name: '  Fern Mock '
	};

	it('gives the backend body for filled details', () => {
		expect(checkDetails(filled)).toEqual({
			ok: true,
			value: {
				birth_month: 6,
				birth_year: 1990,
				gender_division: 'womens',
				display_name: 'Fern Mock'
			}
		});
	});

	it("asks for every field with the backend's messages", () => {
		expect(
			checkDetails({ birth_month: '', birth_year: '', gender_division: '', display_name: ' ' })
		).toEqual({
			ok: false,
			errors: {
				birth_month: 'Enter your birth month.',
				birth_year: 'Enter your birth year.',
				gender_division: 'Choose a gender division.',
				display_name: 'Enter a display name.'
			}
		});
	});

	it("checks the year with signup's rule, so a typo never reaches the backend", () => {
		const year = (birth_year: string) => {
			const result = checkDetails({ ...filled, birth_year });
			return result.ok ? null : result.errors.birth_year;
		};
		expect(year('2206')).toBe('Enter a birth year that has passed.');
		expect(year('20010')).toBe('Enter a birth year that has passed.');
		expect(year(String(new Date().getFullYear() + 1))).toBe('Enter a birth year that has passed.');
		expect(year('1899')).toBe('Enter a birth year of 1900 or later.');
		expect(year('19x0')).toBe('Enter your birth year.');
		expect(year('1990')).toBeNull();
	});

	it('wants a short display name', () => {
		expect(checkDetails({ ...filled, display_name: 'Q'.repeat(65) })).toEqual({
			ok: false,
			errors: { display_name: 'Use 64 characters or fewer.' }
		});
	});
});
