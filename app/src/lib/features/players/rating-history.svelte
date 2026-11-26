<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader } from '#lib/ui/card/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import {
		CHANGE_KINDS,
		FORMAT_LABELS,
		HISTORY_PAGE_SIZE,
		formatRating,
		formatRecordedAt,
		formatReliability,
		historyRangeLabel
	} from './ratings.js';
	import type { RatingHistoryView } from './rating-history.svelte.js';

	let {
		history,
		onpage
	}: {
		/** The page to show. The parent owns it and loads the first page. */
		history: RatingHistoryView;
		/** Load the page at this offset. */
		onpage: (offset: number) => void;
	} = $props();

	const busy = $derived(history.status === 'loading');
	const hasNewer = $derived(history.offset > 0);
	const hasOlder = $derived(history.offset + history.items.length < history.count);
</script>

<Card aria-labelledby="rating-history-title" class="gap-4 border-t border-line pt-6">
	<CardHeader class="gap-2">
		<h2 id="rating-history-title" class="label">Rating history</h2>
		{#if history.items.length > 0}
			<CardDescription>Every change to your ratings, newest first.</CardDescription>
		{/if}
	</CardHeader>
	<CardContent>
		{#if history.status === 'error'}
			<Alert variant={history.errorKind === 'network' ? 'default' : 'destructive'}>
				{#if history.errorKind === 'network'}
					<WifiOffIcon aria-hidden="true" />
					<AlertTitle>You're offline.</AlertTitle>
					<AlertDescription>
						Your rating history needs a connection. Check it, then try again.
					</AlertDescription>
				{:else}
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>Your rating history didn't load.</AlertTitle>
					<AlertDescription>
						{history.errorKind === 'throttled'
							? 'Too many requests in a short time. Wait a minute, then try again.'
							: 'Something went wrong on our side. Wait a moment, then try again.'}
					</AlertDescription>
				{/if}
				<AlertAction>
					<Button variant="outline" size="sm" onclick={() => history.retry()}>Try again</Button>
				</AlertAction>
			</Alert>
		{:else if busy && history.items.length === 0}
			<LoadingState label="Loading your rating history…" />
		{:else if history.status === 'hidden'}
			<p class="max-w-md text-muted">There is no rating history to show.</p>
		{:else if history.status === 'ready' && history.count === 0}
			<p class="max-w-md text-muted">
				Nothing has changed your ratings yet. They change after your confirmed matches.
			</p>
		{:else if history.status === 'ready' && history.items.length === 0}
			<!-- An offset past the end, such as after the history got shorter. -->
			<div class="grid justify-items-start gap-4">
				<p class="max-w-md text-muted">There are no changes on this page.</p>
				<Button variant="outline" size="sm" onclick={() => onpage(0)}>Back to the newest</Button>
			</div>
		{:else if history.items.length > 0}
			<ul class="grid divide-y divide-line" aria-busy={busy} data-testid="rating-history">
				{#each history.items as change, index (`${history.offset}-${index}`)}
					<li class="grid gap-1 py-4">
						<span class="flex items-baseline justify-between gap-4">
							<span class="flex flex-wrap items-center gap-3">
								<span class="font-medium text-secondary">{FORMAT_LABELS[change.format]}</span>
								{#if change.demonstration}
									<Badge variant="outline">Demonstration</Badge>
								{/if}
							</span>
							<span class="text-secondary tabular-nums">{formatRating(change.value)}</span>
						</span>
						<span class="grid gap-1 text-sm text-muted">
							<span>
								<span class="font-medium text-secondary">{CHANGE_KINDS[change.kind].title}</span>,
								<time datetime={change.recordedAt}>{formatRecordedAt(change.recordedAt)}</time>
							</span>
							<span class="max-w-md">{CHANGE_KINDS[change.kind].text}</span>
							<span>Reliability: {formatReliability(change.reliability)}</span>
							{#if change.importedReliability !== null}
								<span>
									Reliability from an external rating: {formatReliability(
										change.importedReliability
									)}
								</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if history.count > HISTORY_PAGE_SIZE}
				<nav
					class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
					aria-label="Rating history pages"
				>
					<span class="text-base text-muted" aria-live="polite" data-testid="rating-history-range">
						{historyRangeLabel(history.offset, history.items.length, history.count)}
					</span>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={!hasNewer || busy}
							onclick={() => onpage(Math.max(0, history.offset - HISTORY_PAGE_SIZE))}
						>
							Newer
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={!hasOlder || busy}
							onclick={() => onpage(history.offset + HISTORY_PAGE_SIZE)}
						>
							Older
						</Button>
					</div>
				</nav>
			{/if}
		{/if}
	</CardContent>
</Card>
