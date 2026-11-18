<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		RecordMatchForm,
		recordedToast,
		type SubmitResult
	} from '#lib/features/record-match/index.js';
	import { CodeEntry, myCode } from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';

	onMount(() => {
		void myCode.load();
	});

	async function recorded(result: SubmitResult) {
		const message = recordedToast(result);
		toast(message.title, {
			description: message.description,
			// The match exists. Only the player's own confirmation is missing, so give it time to be read.
			duration: result.confirmError ? 10_000 : undefined
		});
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
	{#if myCode.status === 'idle' || myCode.status === 'loading'}
		<p class="text-muted" role="status">Loading…</p>
	{:else if myCode.status === 'signed-out'}
		<section class="grid gap-3">
			<p class="max-w-[44ch] text-muted">Sign in to record a match.</p>
			<div>
				<Button href={resolve('/account/login')}>Sign in</Button>
			</div>
		</section>
	{:else if myCode.status === 'error'}
		<section class="grid gap-3" role="alert">
			<p class="max-w-[44ch] text-danger">
				We can't reach the server. Check your connection and try again.
			</p>
			<div>
				<Button variant="outline" onclick={() => myCode.load()}>Try again</Button>
			</div>
		</section>
	{:else if myCode.prompting || !myCode.code}
		<CodeEntry onsave={(code) => myCode.save(code)} />
	{:else}
		{#key myCode.code}
			<RecordMatchForm
				own={myCode.code}
				onrecorded={recorded}
				onchangecode={() => myCode.change()}
			/>
		{/key}
	{/if}
</div>
