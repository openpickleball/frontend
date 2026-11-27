<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { ROUTES } from '#lib/domain/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { InfoPopover, type InfoTerm } from '#lib/ui/info-popover/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { FORMAT_LABELS, RATING_TERMS, formatRating, formatReliability } from './ratings.js';
	import type { PlayerRatings } from './types.js';

	let {
		ratings = null,
		loading = false,
		failed = false,
		title = 'Ratings',
		details = false,
		prominent = false
	}: {
		/** What the backend sent, or `null` when it had none to show (a 404). */
		ratings?: PlayerRatings | null;
		loading?: boolean;
		/** The ratings could not be loaded. */
		failed?: boolean;
		/** The section title. */
		title?: string;
		/** Link to the Ratings page next to the title, as Home does. */
		details?: boolean;
		/**
		 * Say that the numbers are demonstration ones in a boxed notice, not a plain line. The
		 * Ratings page does, because a tab of its own makes the numbers look more official.
		 */
		prominent?: boolean;
	} = $props();

	// Each format is its own rating, so every one gets the same tile. The numbers are the
	// backend's, as they are.
	const list = $derived(ratings?.ratings ?? []);
	const demonstration = $derived(
		ratings !== null && (ratings.demonstration || list.some((rating) => rating.demonstration))
	);
	// One popover for the section, not one per tile. It explains the lines the tiles show.
	const terms = $derived<InfoTerm[]>([
		RATING_TERMS.reliability,
		...(list.some((rating) => rating.importedReliability !== null) ? [RATING_TERMS.imported] : []),
		...(list.some((rating) => !rating.established) ? [RATING_TERMS.early] : []),
		...(list.some((rating) => rating.provisional) ? [RATING_TERMS.provisional] : [])
	]);
</script>

{#snippet detailsLink()}
	<Button href={resolve(ROUTES.ratings)} variant="link">
		Details
		<ArrowRightIcon aria-hidden="true" />
	</Button>
{/snippet}

<Section {title} aside={details ? detailsLink : undefined}>
	{#snippet info()}
		{#if list.length > 0}
			<InfoPopover label="What does reliability mean?" {terms} />
		{/if}
	{/snippet}
	<div class="grid gap-4">
		{#if list.length > 0 && demonstration}
			{#if prominent}
				<Alert data-testid="demonstration-notice">
					<InfoIcon aria-hidden="true" />
					<AlertTitle>Demonstration numbers</AlertTitle>
					<AlertDescription>
						These are demonstration numbers while the rating method is being built.
					</AlertDescription>
				</Alert>
			{:else}
				<p class="max-w-md text-muted">
					These are demonstration numbers while the rating method is being built.
				</p>
			{/if}
		{/if}
		{#if loading}
			<LoadingState label="Loading your ratings…" />
		{:else if failed}
			<p class="max-w-md text-muted">
				We can't load your ratings right now. Check your connection and try again.
			</p>
		{:else if !ratings}
			<p class="max-w-md text-muted">There are no ratings to show.</p>
		{:else if list.length === 0}
			<p class="max-w-md text-muted">
				You don't have a rating yet. Ratings come from your confirmed matches.
			</p>
		{:else}
			<ul class="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="ratings">
				{#each list as rating (rating.format)}
					<li class="grid content-start gap-2 rounded-lg border border-line p-4">
						<span class="font-medium text-secondary">{FORMAT_LABELS[rating.format]}</span>
						<span class="text-3xl font-semibold tracking-tight text-secondary tabular-nums">
							{formatRating(rating.value)}
						</span>
						<span class="grid gap-1 text-sm text-muted">
							<span>Reliability: {formatReliability(rating.reliability)}</span>
							{#if rating.importedReliability !== null}
								<span>
									Reliability from an external rating: {formatReliability(
										rating.importedReliability
									)}
								</span>
							{/if}
							{#if !rating.established}
								<span>Early estimate.</span>
							{/if}
							{#if rating.provisional}
								<span>May still change.</span>
							{/if}
						</span>
						{#if rating.demonstration}
							<span><Badge variant="outline">Demonstration</Badge></span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Section>
