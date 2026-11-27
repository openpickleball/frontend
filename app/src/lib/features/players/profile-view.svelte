<script lang="ts">
	import type { Snippet } from 'svelte';
	import CodeStrip from './code-strip.svelte';
	import OwnCodeGate from './own-code-gate.svelte';

	let {
		children
	}: {
		/** The settings sections below the code, such as the account section. */
		children?: Snippet;
	} = $props();
</script>

<div class="pt-4">
	<h1 class="page-title">Profile</h1>
</div>

<!-- Each section brings its own space above. The display name field shows the player's name. -->
<div>
	<OwnCodeGate
		reloadOnOpen
		fallbackClass="mt-8"
		loading="Loading your profile…"
		signedOut="Sign in to see your OPEN code and your settings."
		errorText="We can't reach the server, so we can't load your profile. Check your connection and try again."
	>
		{#snippet children(code)}
			<CodeStrip {code} />
		{/snippet}
	</OwnCodeGate>

	{@render children?.()}
</div>
