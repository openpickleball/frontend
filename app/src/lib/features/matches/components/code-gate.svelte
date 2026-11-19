<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { OwnCodeGate } from '#lib/features/players/index.js';
	import Notice from './notice.svelte';

	let { children }: { children: Snippet<[PlayerCode]> } = $props();
</script>

<!-- Find the player's own OPEN code, which every match call needs. The gate also covers a sign-out
	and sign-in on the same page: the layout resets the store, and the gate loads it again. -->
<OwnCodeGate
	{children}
	{error}
	fallbackClass="mt-8"
	signedOut="Sign in to see your matches."
	entryHeading="Enter your OPEN code to see your matches"
/>

{#snippet error(retry: () => void)}
	<div class="mt-8">
		<Notice kind="error" title="We can't load your account." onretry={retry}>
			Check your connection, then try again.
		</Notice>
	</div>
{/snippet}
