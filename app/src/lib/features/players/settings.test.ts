import { describe, expect, it } from 'vitest';
import { PRIVACY_ROWS, checkDetails } from './settings.js';

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
		first_name: '  Fern ',
		last_name: ' Mock  '
	};

	it('gives the backend body for filled details', () => {
		expect(checkDetails(filled)).toEqual({
			ok: true,
			value: {
				birth_month: 6,
				birth_year: 1990,
				gender_division: 'womens',
				first_name: 'Fern',
				last_name: 'Mock'
			}
		});
	});

	it("asks for every field with the backend's messages", () => {
		expect(
			checkDetails({
				birth_month: '',
				birth_year: '',
				gender_division: '',
				first_name: ' ',
				last_name: ''
			})
		).toEqual({
			ok: false,
			errors: {
				birth_month: 'Enter your birth month.',
				birth_year: 'Enter your birth year.',
				gender_division: 'Choose a gender division.',
				first_name: 'Enter your first name.',
				last_name: 'Enter your last name.'
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

	it("checks the names with signup's limits and messages", () => {
		expect(checkDetails({ ...filled, first_name: 'Q'.repeat(61), last_name: 'M' }).ok).toBe(true);
		expect(checkDetails({ ...filled, first_name: 'Q'.repeat(62) })).toEqual({
			ok: false,
			errors: { first_name: 'Your first name can be at most 61 characters.' }
		});
		// "First Last" fits in 64 characters, the space included.
		expect(
			checkDetails({ ...filled, first_name: 'Q'.repeat(40), last_name: 'M'.repeat(23) }).ok
		).toBe(true);
		expect(
			checkDetails({ ...filled, first_name: 'Q'.repeat(40), last_name: 'M'.repeat(24) })
		).toEqual({
			ok: false,
			errors: { last_name: 'Your first and last name together can be at most 63 characters.' }
		});
	});
});
