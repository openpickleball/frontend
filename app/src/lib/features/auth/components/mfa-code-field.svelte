<script lang="ts">
	import { TextField } from '#lib/ui/field/index.js';
	import { TOTP_INPUT_MAX_LENGTH, type CodeKind } from '../forms.js';

	/**
	 * The code field of the two-factor steps: 6 digits from the authenticator app (a numeric
	 * keyboard, filled from a text message or the app where the device offers it), or a
	 * recovery code.
	 */
	let {
		id,
		kind,
		value = $bindable(''),
		error = ''
	}: { id: string; kind: CodeKind; value?: string; error?: string } = $props();
</script>

{#if kind === 'totp'}
	<TextField
		{id}
		name="code"
		label="Code from your app"
		inputmode="numeric"
		autocomplete="one-time-code"
		maxlength={TOTP_INPUT_MAX_LENGTH}
		bind:value
		{error}
	/>
{:else}
	<TextField
		{id}
		name="code"
		label="Recovery code"
		autocomplete="off"
		autocapitalize="off"
		spellcheck={false}
		bind:value
		{error}
	/>
{/if}
