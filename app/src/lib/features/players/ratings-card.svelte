<script lang="ts">
	import { Badge } from '#lib/ui/badge/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { FORMAT_LABELS, formatRating, formatReliability, headlineRating } from './ratings.js';
	import type { PlayerRatings, Rating } from './types.js';

	let {
		ratings = null,
		loading = false,
		failed = false
	}: {
		/** What the backend sent, or `null` when it had none to show (a 404). */
		ratings?: PlayerRatings | null;
		loading?: boolean;
		/** The ratings could not be loaded. */
		failed?: boolean;
	} = $props();

	// The backend's numbers as they are. Picking the one with the highest reliability to show
	// first only compares them.
	const headline = $derived(ratings ? headlineRating(ratings.ratings) : null);
	const others = $derived(
		ratings && headline ? ratings.ratings.filter((rating) => rating !== headline) : []
	);
	const demonstration = $derived(
		ratings !== null &&
			(ratings.demonstration || ratings.ratings.some((rating) => rating.demonstration))
	);
</script>

{#snippet name(rating: Rating)}
	<span class="flex flex-wrap items-center gap-3">
		<span class="font-medium text-secondary">{FORMAT_LABELS[rating.format]}</span>
		{#if rating.demonstration}
			<Badge variant="outline">Demonstration</Badge>
		{/if}
	</span>
{/snippet}

{#snippet details(rating: Rating)}
	<span class="grid gap-1 text-sm text-muted">
		<span>Reliability: {formatReliability(rating.reliability)}</span>
		{#if rating.importedReliability !== null}
			<span>
				Reliability from an external rating: {formatReliability(rating.importedReliability)}
			</span>
		{/if}
		{#if !rating.established}
			<span>Early estimate: not enough matches yet.</span>
		{/if}
		{#if rating.provisional}
			<span>It may change when ratings are next recounted.</span>
		{/if}
	</span>
{/snippet}

<Section title="Ratings">
	<div class="grid gap-4">
		{#if headline && demonstration}
			<p class="max-w-md text-muted">
				These are demonstration numbers while the rating method is being built.
			</p>
		{/if}
		{#if loading}
			<LoadingState label="Loading your ratings…" />
		{:else if failed}
			<p class="max-w-md text-muted">
				We can't load your ratings right now. Check your connection and try again.
			</p>
		{:else if !ratings}
			<p class="max-w-md text-muted">There are no ratings to show.</p>
		{:else if !headline}
			<p class="max-w-md text-muted">
				You don't have a rating yet. Ratings come from your confirmed matches.
			</p>
		{:else}
			<div class="grid gap-2" data-testid="headline-rating">
				{@render name(headline)}
				<span class="text-5xl font-semibold tracking-tight text-secondary tabular-nums">
					{formatRating(headline.value)}
				</span>
				{@render details(headline)}
			</div>
			{#if others.length > 0}
				<ul class="grid divide-y divide-line border-t border-line">
					{#each others as rating (rating.format)}
						<li class="grid gap-1 py-4">
							<span class="flex items-baseline justify-between gap-4">
								{@render name(rating)}
								<span class="text-secondary tabular-nums">{formatRating(rating.value)}</span>
							</span>
							{@render details(rating)}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</Section>
