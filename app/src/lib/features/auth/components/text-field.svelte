<script lang="ts">
	import { Input } from '#lib/ui/input/index.js';
	import { Label } from '#lib/ui/label/index.js';
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

<div class="grid gap-2">
	<Label for={id}>{label}</Label>
	<div class="relative">
		<Input
			{id}
			bind:value
			type={reveal && shown ? 'text' : type}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			class={reveal ? 'pr-20' : ''}
			{...rest}
		/>
		{#if reveal}
			<button
				type="button"
				aria-pressed={shown}
				aria-controls={id}
				onclick={() => (shown = !shown)}
				class="absolute inset-y-0 right-1.5 my-1.5 rounded-full px-3.5 text-sm font-semibold text-muted hover:text-secondary focus-visible:outline-offset-0"
			>
				{shown ? 'Hide' : 'Show'}
				<span class="sr-only">password</span>
			</button>
		{/if}
	</div>
	{#if hint}
		<p id="{id}-hint" class="text-sm text-faint">{hint}</p>
	{/if}
	{#if error}
		<p id="{id}-error" class="flex items-start gap-2 text-sm font-medium text-danger">
			<span
				aria-hidden="true"
				class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger text-[11px] leading-none font-bold text-primary"
				>!</span
			>
			<span>{error}</span>
		</p>
	{/if}
</div>
