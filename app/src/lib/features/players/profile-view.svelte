<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import CodeCard from './code-card.svelte';
	import { myCode } from './my-code.svelte.js';
	import OwnCodeGate from './own-code-gate.svelte';
	import { ProfileStats } from './profile-stats.svelte.js';
	import RatingsCard from './ratings-card.svelte';

	let {
		countMatches,
		sample,
		children
	}: {
		/** `countMatches` from `features/matches`, which this feature does not import. */
		countMatches: (code: PlayerCode) => Promise<number>;
		/** Show sample ratings. Only the mock modes do (Decision Q2). */
		sample: boolean;
		/** More sections at the end of the page, such as the account section. */
		children?: Snippet;
	} = $props();

	// The deps are fixed for the life of the page.
	const stats = untrack(() => new ProfileStats({ countMatches, sample }));

	$effect(() => {
		const code = myCode.code;
		untrack(() => void stats.load(code));
		return () => stats.cancel();
	});
</script>

<div class="pt-4">
	<h1 class="page-title">Profile</h1>
	{#if myCode.displayName}
		<p class="mt-2 wrap-anywhere text-muted">{myCode.displayName}</p>
	{:else if myCode.email}
		<p class="mt-2 wrap-anywhere text-muted">{myCode.email}</p>
	{/if}
</div>

<div class="mt-8 grid gap-10">
	<OwnCodeGate
		reloadOnOpen
		showChange
		loading="Loading your profile…"
		signedOut="Sign in to see your OPEN code and your matches."
		errorText="We can't reach the server, so we can't load your profile. Check your connection and try again."
		changeHeading="Change your OPEN code"
	>
		{#snippet children(code)}
			<CodeCard {code} />

			{#if myCode.storageFailed}
				<p class="max-w-md text-base text-danger" role="status">
					We couldn't save your code on this device, so you may need to enter it again next time.
				</p>
			{/if}

			<dl class="flex gap-10 border-t border-line pt-6">
				<div>
					<dt class="font-display text-xs tracking-widest text-muted uppercase">Matches</dt>
					<dd
						class="mt-1 text-3xl font-medium tabular-nums text-secondary"
						data-testid="match-count"
					>
						{#if stats.matchCount !== null}
							{stats.matchCount}
						{:else if stats.matchCountFailed}
							<span class="text-base text-muted">Not available right now</span>
						{:else}
							<LoadingState label="Loading…" class="text-base" />
						{/if}
					</dd>
				</div>
			</dl>

			<RatingsCard {sample} ratings={stats.ratings} loading={stats.ratingsLoading} />

			{#if myCode.canChange}
				<div class="border-t border-line pt-6">
					<p class="max-w-md text-base text-muted">
						This code was entered on this device. Entered the wrong one?
					</p>
					<Button variant="outline" size="sm" class="mt-3" onclick={() => myCode.change()}>
						Change code
					</Button>
				</div>
			{/if}
		{/snippet}
	</OwnCodeGate>

	{@render children?.()}
</div>
