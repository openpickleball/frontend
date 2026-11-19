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
	const describedBy = $derived(
		[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	);
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
				<InputGroupButton aria-pressed={shown} aria-controls={id} onclick={() => (shown = !shown)}>
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
	{#if hint}
		<FieldDescription id="{id}-hint">{hint}</FieldDescription>
	{/if}
	{#if error}
		<FieldError id="{id}-error">{error}</FieldError>
	{/if}
</Field>
