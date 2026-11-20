export type FieldA11yOptions = {
	/** The control's id. The error and hint ids are `{id}-error` and `{id}-hint`. */
	id: string;
	/** The error message. Empty or missing means the field is fine. */
	error?: string | null;
	/** Whether the field has a hint. Pass the hint text, or `true`. */
	hint?: string | boolean | null;
	/** Show the hint next to an error, not only when there is none. */
	keepHint?: boolean;
	/** Ids of other elements that describe the control, listed before the hint and error. */
	before?: string[];
	/** Ids of other elements that describe the control, listed after the hint and error. */
	after?: string[];
};

export type FieldA11y = {
	/** The id for the `FieldError`. */
	errorId: string;
	/** The id for the `FieldDescription` or other hint element. */
	hintId: string;
	/** Spread onto the control. */
	attrs: { 'aria-invalid': 'true' | undefined; 'aria-describedby': string | undefined };
};

/**
 * The `aria-invalid` and `aria-describedby` attributes for a control, and the ids of the
 * `FieldError` and hint they point to. Use it in a `$derived`, so the ids come from one place.
 * By default the error takes the place of the hint, as in `TextField`.
 */
export function fieldA11y({
	id,
	error,
	hint,
	keepHint = false,
	before = [],
	after = []
}: FieldA11yOptions): FieldA11y {
	const errorId = `${id}-error`;
	const hintId = `${id}-hint`;
	const ids = [...before];
	if (hint && (keepHint || !error)) ids.push(hintId);
	if (error) ids.push(errorId);
	ids.push(...after);
	return {
		errorId,
		hintId,
		attrs: {
			'aria-invalid': error ? 'true' : undefined,
			'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined
		}
	};
}
