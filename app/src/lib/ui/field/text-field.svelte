<script lang="ts">
	import {
		Field,
		FieldDescription,
		FieldError,
		FieldLabel,
		fieldA11y
	} from '#lib/ui/field/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import {
		InputGroup,
		InputGroupAddon,
		InputGroupButton,
		InputGroupInput
	} from '#lib/ui/input-group/index.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		id,
		label,
		value = $bindable(''),
		error = '',
		hint = '',
		reveal = false,
		type = 'text',
		...rest
	}: Omit<HTMLInputAttributes, 'value' | 'type' | 'files'> & {
		id: string;
		label: string;
		value?: string;
		/** A message for this field. Empty means the field is fine. */
		error?: string;
		hint?: string;
		/** For a password: add a Show and Hide button. */
		reveal?: boolean;
		type?: 'text' | 'email' | 'password' | 'date';
	} = $props();

	let shown = $state(false);
	const a11y = $derived(fieldA11y({ id, error, hint }));
</script>

<Field>
	<FieldLabel for={id}>{label}</FieldLabel>
	{#if reveal}
		<InputGroup>
			<InputGroupInput {id} bind:value type={shown ? 'text' : type} {...a11y.attrs} {...rest} />
			<InputGroupAddon>
				<InputGroupButton aria-controls={id} onclick={() => (shown = !shown)}>
					{shown ? 'Hide' : 'Show'}
					<span class="sr-only">{label.toLowerCase()}</span>
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	{:else}
		<Input {id} bind:value {type} {...a11y.attrs} {...rest} />
	{/if}
	<!-- One line of guidance: the error takes the place of the hint. -->
	{#if error}
		<FieldError id={a11y.errorId}>{error}</FieldError>
	{:else if hint}
		<FieldDescription id={a11y.hintId}>{hint}</FieldDescription>
	{/if}
</Field>
