/** The months for a birth month select, with the numbers the backend takes as values. */
export const MONTHS: readonly { value: string; label: string }[] = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
].map((label, index) => ({ value: String(index + 1), label }));

/** The backend's gender divisions, with the words the forms show for them. */
export const GENDER_OPTIONS: readonly { value: 'mens' | 'womens'; label: string }[] = [
	{ value: 'mens', label: 'Man' },
	{ value: 'womens', label: 'Woman' }
];
