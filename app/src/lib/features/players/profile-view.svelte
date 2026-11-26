<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import CodeCard from './code-card.svelte';
	import { myCode } from './my-code.svelte.js';
	import OwnCodeGate from './own-code-gate.svelte';
	import { ProfileStats } from './profile-stats.svelte.js';
	import RatingHistory from './rating-history.svelte';
	import { RatingHistoryView } from './rating-history.svelte.js';
	import RatingsCard from './ratings-card.svelte';

	let {
		countMatches,
		children
	}: {
		/** `countMatches` from `features/matches`, which this feature does not import. */
		countMatches: (code: PlayerCode) => Promise<number>;
		/** More sections at the end of the page, such as the account section. */
		children?: Snippet;
	} = $props();

	// The deps are fixed for the life of the page.
	const stats = untrack(() => new ProfileStats({ countMatches }));
	const history = new RatingHistoryView();

	$effect(() => {
		const code = myCode.code;
		untrack(() => {
			void stats.load(code);
			void history.load(code);
		});
		return () => {
			stats.cancel();
			history.cancel();
		};
	});
</script>

<div class="pt-4">
	<h1 class="page-title">Profile</h1>
	{#if myCode.displayName}
		<p class="mt-2 wrap-anywhere text-muted">{myCode.displayName}</p>
	{/if}
</div>

<div class="mt-8 grid gap-8">
	<OwnCodeGate
		reloadOnOpen
		loading="Loading your profile…"
		signedOut="Sign in to see your OPEN code and your matches."
		errorText="We can't reach the server, so we can't load your profile. Check your connection and try again."
	>
		{#snippet children(code)}
			<CodeCard {code} />

			<dl class="flex gap-8 border-t border-line pt-6">
				<div>
					<dt class="label">Matches</dt>
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

			<RatingsCard
				ratings={stats.ratings}
				loading={stats.ratingsLoading}
				failed={stats.ratingsFailed}
			/>

			<RatingHistory {history} onpage={(offset) => void history.load(code, offset)} />
		{/snippet}
	</OwnCodeGate>

	{@render children?.()}
</div>
