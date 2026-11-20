<script lang="ts">
	import { Field, FieldDescription, FieldError, FieldLabel } from '#lib/ui/field/index.js';
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
		type?: 'text' | 'email' | 'password';
	} = $props();

	let shown = $state(false);
	const describedBy = $derived((error ? `${id}-error` : hint ? `${id}-hint` : '') || undefined);
</script>

<Field>
	<FieldLabel for={id}>{label}</FieldLabel>
	{#if reveal}
		<InputGroup>
			<InputGroupInput
				{id}
				bind:value
				type={shown ? 'text' : type}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				{...rest}
			/>
			<InputGroupAddon>
				<InputGroupButton aria-controls={id} onclick={() => (shown = !shown)}>
					{shown ? 'Hide' : 'Show'}
					<span class="sr-only">password</span>
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	{:else}
		<Input
			{id}
			bind:value
			{type}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			{...rest}
		/>
	{/if}
	<!-- One line of guidance: the error takes the place of the hint. -->
	{#if error}
		<FieldError id="{id}-error">{error}</FieldError>
	{:else if hint}
		<FieldDescription id="{id}-hint">{hint}</FieldDescription>
	{/if}
</Field>
