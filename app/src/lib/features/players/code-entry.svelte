<script lang="ts">
	import { CODE_INPUT_MAX_LENGTH, parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Field, FieldError, FieldLabel } from '#lib/ui/field/index.js';
	import { Input } from '#lib/ui/input/index.js';

	let {
		onsave,
		oncancel,
		heading = 'Enter your OPEN code',
		id = 'code-entry'
	}: {
		/** Called with the checked, normalized code. */
		onsave: (code: PlayerCode) => void;
		/** Show a Cancel button, for replacing a code that is already saved. */
		oncancel?: () => void;
		heading?: string;
		/** Prefix for element ids, in case two prompts share a page. */
		id?: string;
	} = $props();

	let value = $state('');
	let touched = $state(false);
	let submitted = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	// The longest code is 9 characters once spaces and hyphens are gone. From there on it is
	// worth saying what is wrong while the player is still typing.
	const FULL_LENGTH = 9;

	const trimmed = $derived(value.trim());
	const result = $derived(trimmed === '' ? null : parsePlayerCode(trimmed));
	const compactLength = $derived(trimmed.replace(/[\s-]/g, '').length);
	const code = $derived(result?.ok ? result.value : null);
	const error = $derived.by(() => {
		if (result && !result.ok && (touched || submitted || compactLength >= FULL_LENGTH)) {
			return result.error.message;
		}
		if (!result && submitted) return 'Enter your OPEN code.';
		return null;
	});
	// "Fixed" tells the player we changed what they typed (case, hyphens, look-alike letters).
	const fixed = $derived(code !== null && code !== trimmed);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (code) onsave(code);
		else input?.focus();
	}

	const describedBy = $derived(
		[`${id}-help`, error ? `${id}-error` : null, code ? `${id}-preview` : null]
			.filter(Boolean)
			.join(' ')
	);
</script>

<form class="grid gap-4" onsubmit={submit} novalidate aria-labelledby="{id}-heading">
	<div class="grid gap-3">
		<h2 id="{id}-heading" class="text-2xl font-medium tracking-tight text-secondary">
			{heading}
		</h2>
		<p id="{id}-help" class="max-w-md text-muted">
			Your OPEN code starts with P and has two groups of four letters and numbers, like P-4RWN-8TQ3.
			That one is an example, not yours. OPEN does not show your code in the app yet, so use the one
			you were given. We keep it on this device only, so you only enter it once.
		</p>
	</div>

	<Field>
		<FieldLabel for="{id}-input">Your OPEN code</FieldLabel>
		<Input
			id="{id}-input"
			bind:ref={input}
			bind:value
			class="font-display tracking-wide uppercase"
			type="text"
			autocomplete="off"
			autocapitalize="characters"
			autocorrect="off"
			spellcheck={false}
			maxlength={CODE_INPUT_MAX_LENGTH}
			placeholder="P-XXXX-XXXX"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			onblur={() => (touched = true)}
		/>
		{#if error}
			<FieldError id="{id}-error">{error}</FieldError>
		{/if}
		<p id="{id}-preview" class="min-h-6 text-base text-muted" role="status">
			{#if code}
				{fixed ? 'We will save it as' : 'Looks right:'}
				<span class="font-display text-secondary">{code}</span>
			{/if}
		</p>
	</Field>

	<div class="flex flex-wrap gap-3">
		<Button type="submit">Save code</Button>
		{#if oncancel}
			<Button type="button" variant="outline" onclick={oncancel}>Cancel</Button>
		{/if}
	</div>
</form>
