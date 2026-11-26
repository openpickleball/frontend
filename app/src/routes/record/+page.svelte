<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ROUTES } from '#lib/domain/index.js';
	import { RecordMatchForm, type SubmitResult } from '#lib/features/record-match/index.js';
	import { rememberMatch } from '#lib/features/matches/index.js';
	import { offlineQueue } from '#lib/features/offline/index.js';
	import { OwnCodeGate } from '#lib/features/players/index.js';

	// A refused queued match the player chose to fix, from "Fix and record again".
	const fixing = $derived.by(() => {
		const id = page.url.searchParams.get('fix');
		return id ? (offlineQueue.refused.find((item) => item.id === id) ?? null) : null;
	});

	/** The fixed match is recorded or queued again, so its old copy goes. */
	function doneFixing() {
		if (fixing) void offlineQueue.remove(fixing.id);
	}

	async function recorded(result: SubmitResult) {
		doneFixing();
		toast('Match recorded');
		// Hand the match to its page so it opens from the cache. The backend recorded the player's
		// team confirmation with the match, so it waits on the other team only.
		rememberMatch(result.match);
		await goto(resolve('/matches/[code]', { code: result.match.code }));
	}

	async function queued() {
		doneFixing();
		toast("No connection. Match saved on this device, and we'll send it when you're back online.");
		await goto(resolve(ROUTES.home));
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
	<OwnCodeGate reloadOnOpen signedOut="Sign in to record a match.">
		{#snippet children(own)}
			{#key `${own}|${fixing?.id ?? ''}`}
				<RecordMatchForm
					{own}
					onrecorded={recorded}
					onqueued={queued}
					fixing={fixing?.problem
						? { form: fixing.form, fields: fixing.problem.fields }
						: undefined}
				/>
			{/key}
		{/snippet}
	</OwnCodeGate>
</div>
