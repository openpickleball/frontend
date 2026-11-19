<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		RecordMatchForm,
		recordedToast,
		type SubmitResult
	} from '#lib/features/record-match/index.js';
	import { rememberMatch } from '#lib/features/matches/index.js';
	import { OwnCodeGate, myCode } from '#lib/features/players/index.js';

	async function recorded(result: SubmitResult) {
		const message = recordedToast(result);
		toast(message.title, {
			description: message.description,
			// The match exists. Only the player's own confirmation is missing, so give it time to be read.
			duration: result.confirmError ? 10_000 : undefined
		});
		// Hand the match to its page so it opens from the cache. It is shown as the API last returned
		// it, so a failed confirm leaves the team unconfirmed and Confirm still shows.
		rememberMatch(result.match);
		await goto(resolve('/matches/[code]', { code: result.match.code }));
	}
</script>

<svelte:head>
	<title>Record a match · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<h1 class="page-title">Record a match</h1>
	<p class="mt-3 max-w-[52ch] text-muted">
		Enter the final score. Once it's saved, the other team can confirm it or dispute it.
	</p>
</div>

<div class="mt-6 max-w-2xl">
	<OwnCodeGate reloadOnOpen showChange signedOut="Sign in to record a match.">
		{#snippet children(own)}
			{#key own}
				<RecordMatchForm {own} onrecorded={recorded} onchangecode={() => myCode.change()} />
			{/key}
		{/snippet}
	</OwnCodeGate>
</div>
