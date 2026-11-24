<script lang="ts">
	import {
		Field,
		FieldDescription,
		FieldError,
		FieldLabel,
		fieldA11y
	} from '#lib/ui/field/index.js';
	import { NativeSelect, NativeSelectOption } from '#lib/ui/native-select/index.js';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		id,
		label,
		options,
		placeholder,
		value = $bindable(''),
		error = '',
		hint = '',
		...rest
	}: Omit<HTMLSelectAttributes, 'value'> & {
		id: string;
		label: string;
		options: readonly { value: string; label: string }[];
		/** The blank first option, shown until one is chosen. */
		placeholder: string;
		value?: string;
		/** A message for this field. Empty means the field is fine. */
		error?: string;
		hint?: string;
	} = $props();

	const a11y = $derived(fieldA11y({ id, error, hint }));
</script>

<!-- A native select with the same label, hint and error wiring as TextField. -->
<Field>
	<FieldLabel for={id}>{label}</FieldLabel>
	<NativeSelect {id} bind:value {...a11y.attrs} {...rest}>
		<NativeSelectOption value="">{placeholder}</NativeSelectOption>
		{#each options as option (option.value)}
			<NativeSelectOption value={option.value}>{option.label}</NativeSelectOption>
		{/each}
	</NativeSelect>
	{#if error}
		<FieldError id={a11y.errorId}>{error}</FieldError>
	{:else if hint}
		<FieldDescription id={a11y.hintId}>{hint}</FieldDescription>
	{/if}
</Field>
