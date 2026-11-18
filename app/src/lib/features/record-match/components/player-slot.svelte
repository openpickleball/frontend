<script lang="ts">
	import { tick } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import FieldError from './field-error.svelte';

	let {
		id,
		label,
		placeholder = 'P-XXXX-XXXX',
		code,
		text = $bindable(''),
		error = '',
		locked = false,
		oncommit,
		onremove
	}: {
		/** Id of the field. A chip's remove button takes the same id, so an error link finds either. */
		id: string;
		/** What a screen reader hears for the box, such as "Your partner's OPEN code". */
		label: string;
		placeholder?: string;
		/** The checked code, once there is one. It shows as a chip. */
		code: PlayerCode | null;
		/** What is typed, until it becomes a chip. */
		text?: string;
		error?: string;
		/** The player's own code: shown as "You", with nothing to remove. */
		locked?: boolean;
		/** Turn the typed text into a chip. */
		oncommit: () => void;
		onremove: () => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);

	async function onkeydown(event: KeyboardEvent) {
		// Enter would submit the whole form. Here it only checks the code.
		if (event.key !== 'Enter') return;
		event.preventDefault();
		oncommit();
		await tick();
		document.getElementById(id)?.focus();
	}

	async function remove() {
		onremove();
		await tick();
		input?.focus();
	}
</script>

<div class="grid gap-1.5">
	{#if code}
		<div class="flex">
			<span
				class={[
					'inline-flex min-h-11 items-center gap-2 rounded-full border bg-surface pr-1.5 pl-4 text-secondary',
					error ? 'border-danger' : 'border-line'
				]}
			>
				{#if locked}
					<span class="text-[13px] font-semibold text-muted">You</span>
				{/if}
				<span class="font-display tracking-wide" data-testid="chip">{code}</span>
				{#if locked}
					<span class="mr-2.5"></span>
				{:else}
					<button
						type="button"
						{id}
						onclick={remove}
						aria-label="Remove {code}"
						aria-describedby={error ? `${id}-error` : undefined}
						class="grid size-9 place-items-center rounded-full text-muted hover:text-secondary focus-visible:outline-offset-0"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="round"
							aria-hidden="true"
							class="size-4"
						>
							<path d="M6 6l12 12M18 6 6 18" />
						</svg>
					</button>
				{/if}
			</span>
		</div>
	{:else}
		<Input
			{id}
			bind:ref={input}
			bind:value={text}
			{onkeydown}
			onblur={oncommit}
			aria-label={label}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			class="font-display tracking-wide uppercase placeholder:normal-case"
			type="text"
			autocomplete="off"
			autocapitalize="characters"
			autocorrect="off"
			spellcheck={false}
			maxlength={64}
			{placeholder}
		/>
	{/if}
	{#if error}
		<FieldError id="{id}-error" message={error} />
	{/if}
</div>
