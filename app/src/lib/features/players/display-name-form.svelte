<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/ui/button/index.js';
	import { Field, FieldDescription, FieldError, FieldLabel } from '#lib/ui/field/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import type { SaveNameResult } from './settings-store.svelte.js';
	import { DISPLAY_NAME_MAX } from './settings.js';

	let {
		name,
		onsave
	}: {
		/** The display name saved now. */
		name: string;
		/** Save the new name. The result says whether it worked. */
		onsave: (raw: string) => Promise<SaveNameResult>;
	} = $props();

	const id = 'display-name';
	// The form starts from the saved name. After that it is the player's own text.
	let value = $state(untrack(() => name));
	let error = $state('');
	let saved = $state(false);
	let busy = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		saved = false;
		const result = await onsave(value);
		busy = false;
		if (result.ok) {
			value = result.value;
			saved = true;
		} else {
			error = result.message;
			input?.focus();
		}
	}

	const describedBy = $derived(
		[`${id}-hint`, error ? `${id}-error` : ''].filter(Boolean).join(' ')
	);
</script>

<form class="grid max-w-md gap-4" onsubmit={submit} novalidate>
	<Field>
		<FieldLabel for={id}>Display name</FieldLabel>
		<Input
			{id}
			bind:ref={input}
			bind:value
			type="text"
			autocomplete="nickname"
			maxlength={DISPLAY_NAME_MAX}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			oninput={() => (saved = false)}
		/>
		<FieldDescription id="{id}-hint">
			Other players see this name, and can find you by it.
		</FieldDescription>
		{#if error}
			<FieldError id="{id}-error">{error}</FieldError>
		{/if}
	</Field>
	<div class="flex flex-wrap items-center gap-4">
		<Button type="submit" variant="outline" size="sm" disabled={busy}>
			{#if busy}<Spinner />{/if}
			Save name
		</Button>
		<p class="text-base text-muted" role="status">{saved ? 'Name saved.' : ''}</p>
	</div>
</form>
