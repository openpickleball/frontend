<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { RecordMatchForm, type SubmitResult } from '#lib/features/record-match/index.js';
	import { rememberMatch } from '#lib/features/matches/index.js';
	import { OwnCodeGate, myCode } from '#lib/features/players/index.js';

	async function recorded(result: SubmitResult) {
		toast('Match recorded');
		// Hand the match to its page so it opens from the cache. The backend recorded the player's
		// team confirmation with the match, so it waits on the other team only.
		rememberMatch(result.match);
		await goto(resolve('/matches/[code]', { code: result.match.code }));
	}
</script>

<svelte:head>
	<title>Record a match · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<h1 class="page-title">Record a match</h1>
	<p class="mt-4 max-w-md text-muted">
		Enter the final score. Once it's saved, the other team can confirm it or dispute it.
	</p>
</div>

<div class="mt-8 max-w-2xl">
	<OwnCodeGate reloadOnOpen showChange signedOut="Sign in to record a match.">
		{#snippet children(own)}
			{#key own}
				<RecordMatchForm {own} onrecorded={recorded} onchangecode={() => myCode.change()} />
			{/key}
		{/snippet}
	</OwnCodeGate>
</div>
