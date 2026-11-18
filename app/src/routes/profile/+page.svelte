<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_API_MOCK } from '$app/env/public';
	import { resolve } from '$app/paths';
	import {
		CodeCard,
		CodeEntry,
		RatingsCard,
		fetchMatchCount,
		fetchRatings,
		isSampleMode,
		myCode,
		type PlayerRatings
	} from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';

	// Sample ratings only in the mock modes. The real backend has no ratings (Decision Q2).
	const sample = isSampleMode(PUBLIC_API_MOCK);

	let matchCount = $state<number | null>(null);
	let matchCountFailed = $state(false);
	let ratings = $state<PlayerRatings | null>(null);
	let ratingsLoading = $state(false);

	onMount(() => {
		// The root layout supplies the signed-in email through setAccountEmailSource, set at the
		// top level of its script so it is in place before this runs (see features/players).
		void myCode.load();
	});

	$effect(() => {
		const code = myCode.code;
		matchCount = null;
		matchCountFailed = false;
		ratings = null;
		if (!code) return;
		let stale = false;
		fetchMatchCount(code).then(
			(count) => {
				if (!stale) matchCount = count;
			},
			() => {
				if (!stale) matchCountFailed = true;
			}
		);
		if (sample) {
			ratingsLoading = true;
			fetchRatings(code)
				.then(
					(found) => {
						if (!stale) ratings = found;
					},
					() => {
						// The card says there is nothing to show.
					}
				)
				.finally(() => {
					if (!stale) ratingsLoading = false;
				});
		}
		return () => {
			stale = true;
		};
	});
</script>

<svelte:head>
	<title>Profile · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<h1 class="page-title">Profile</h1>
	{#if myCode.displayName}
		<p class="mt-2 text-muted">{myCode.displayName}</p>
	{:else if myCode.email}
		<p class="mt-2 text-muted">{myCode.email}</p>
	{/if}
</div>

<div class="mt-8 grid gap-10">
	{#if myCode.status === 'idle' || myCode.status === 'loading'}
		<p class="text-muted" role="status">Loading your profile…</p>
	{:else if myCode.status === 'signed-out'}
		<section class="grid gap-3">
			<p class="max-w-[44ch] text-muted">Sign in to see your OPEN code and your matches.</p>
			<div>
				<Button href={resolve('/account/login')}>Sign in</Button>
			</div>
		</section>
	{:else if myCode.status === 'error'}
		<section class="grid gap-3" role="alert">
			<p class="max-w-[44ch] text-danger">
				We can't reach the server, so we can't load your profile. Check your connection and try
				again.
			</p>
			<div>
				<Button variant="outline" onclick={() => myCode.load()}>Try again</Button>
			</div>
		</section>
	{:else if myCode.prompting}
		<CodeEntry
			onsave={(code) => myCode.save(code)}
			oncancel={myCode.status === 'ready' ? () => myCode.cancel() : undefined}
			heading={myCode.status === 'ready' ? 'Change your OPEN code' : 'Enter your OPEN code'}
		/>
	{:else if myCode.code}
		<CodeCard code={myCode.code} />

		{#if myCode.storageFailed}
			<p class="max-w-[48ch] text-[15px] text-danger" role="status">
				We couldn't save your code on this device, so you may need to enter it again next time.
			</p>
		{/if}

		<dl class="flex gap-10 border-t border-line pt-6">
			<div>
				<dt class="font-display text-[11px] tracking-[0.14em] text-muted uppercase">Matches</dt>
				<dd class="mt-1 text-3xl font-medium tabular-nums text-secondary" data-testid="match-count">
					{#if matchCount !== null}
						{matchCount}
					{:else if matchCountFailed}
						<span class="text-base text-muted">Not available right now</span>
					{:else}
						<span class="text-base text-muted">Loading…</span>
					{/if}
				</dd>
			</div>
		</dl>

		<RatingsCard {sample} {ratings} loading={ratingsLoading} />

		{#if myCode.canChange}
			<div class="border-t border-line pt-6">
				<p class="max-w-[48ch] text-[15px] text-muted">
					This code was entered on this device. Entered the wrong one?
				</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => myCode.change()}>
					Change code
				</Button>
			</div>
		{/if}

		<!-- T6 (auth) adds Sign out here, in an "Account" section. -->
	{/if}
</div>
