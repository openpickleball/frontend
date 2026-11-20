<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { OwnCodeGate } from '#lib/features/players/index.js';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';

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
		<Alert variant="destructive">
			<CircleAlertIcon aria-hidden="true" />
			<AlertTitle>We can't load your account.</AlertTitle>
			<AlertDescription>Check your connection, then try again.</AlertDescription>
			<AlertAction
				><Button variant="outline" size="sm" onclick={retry}>Try again</Button></AlertAction
			>
		</Alert>
	</div>
{/snippet}
