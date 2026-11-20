import Description from './field-description.svelte';
import Error from './field-error.svelte';
import Label from './field-label.svelte';
import Legend from './field-legend.svelte';
import FieldSet from './field-set.svelte';
import Field from './field.svelte';

export { fieldA11y, type FieldA11y, type FieldA11yOptions } from './a11y.js';

export {
	Field,
	FieldSet,
	Legend as FieldLegend,
	Label,
	Description,
	Error,
	//
	Label as FieldLabel,
	Description as FieldDescription,
	Error as FieldError
};
