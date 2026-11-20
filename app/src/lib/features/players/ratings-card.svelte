<script lang="ts">
	import { Badge } from '#lib/ui/badge/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { formatRating } from './ratings.js';
	import type { PlayerRatings, Rating } from './types.js';

	let {
		sample,
		ratings = null,
		loading = false
	}: {
		/**
		 * True in the mock modes, where the numbers are made up. False against the real backend,
		 * which has no ratings yet (Decision Q2, plans/frontend-v1/plan.md).
		 */
		sample: boolean;
		ratings?: PlayerRatings | null;
		loading?: boolean;
	} = $props();

	// The headline is the format with more play behind it, so the big number is the steadier one.
	const headline = $derived.by(() => {
		if (!ratings) return null;
		const options = [
			{ format: 'Doubles', rating: ratings.doubles },
			{ format: 'Singles', rating: ratings.singles }
		].filter((o): o is { format: string; rating: Rating } => o.rating !== null);
		options.sort((a, b) => b.rating.reliability - a.rating.reliability);
		return options[0] ?? null;
	});
</script>

<section class="grid gap-3.5" aria-labelledby="rating-title">
	<div class="flex items-center justify-between gap-3">
		<h2 id="rating-title" class="label">Rating</h2>
		{#if sample}
			<Badge variant="outline">Sample data</Badge>
		{/if}
	</div>

	{#if !sample}
		<div class="grid gap-2 border border-line bg-surface p-5">
			<h3 class="text-lg font-medium text-secondary">Ratings aren't live yet</h3>
			<p class="max-w-md text-muted">
				Ratings will be worked out from your confirmed matches. Your matches are saved in the
				meantime.
			</p>
			<p class="max-w-md text-muted">
				When ratings go live, you'll be able to see what changed your rating after every match, and
				why.
			</p>
		</div>
	{:else}
		<div
			class="grid gap-3 border border-dashed border-field bg-surface p-5"
			aria-describedby="sample-note"
		>
			<p id="sample-note" class="text-base font-semibold text-secondary">
				Sample numbers. This is not your rating, and ratings are not live yet.
			</p>
			{#if loading}
				<LoadingState label="Loading the sample…" />
			{:else if headline}
				<p class="flex items-baseline gap-3">
					<span class="font-display text-5xl tracking-tight text-secondary tabular-nums">
						{formatRating(headline.rating.value)}
					</span>
					<span class="text-muted">{headline.format}</span>
				</p>
				<ul class="grid divide-y divide-line border-t border-line">
					{#each [{ name: 'Singles', rating: ratings?.singles ?? null }, { name: 'Doubles', rating: ratings?.doubles ?? null }] as row (row.name)}
						<li class="flex items-baseline justify-between gap-4 py-2.5">
							<span class="text-secondary">{row.name}</span>
							<span class="text-muted">
								{#if row.rating}
									<span class="tabular-nums">{formatRating(row.rating.value)}</span>{row.rating
										.provisional
										? ', early estimate'
										: ''}
								{:else}
									Not enough matches yet
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-muted">There are no sample numbers for this player.</p>
			{/if}
		</div>
	{/if}
</section>
