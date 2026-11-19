<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { myCode } from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { rangeLabel, matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { PAGE_SIZE } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/** `page` is 1 for the newest matches, 2 for the next 20, and so on. */
	let { page = 1 }: { page?: number } = $props();

	const view = new MatchListView();
	onDestroy(() => view.cancel());

	$effect(() => {
		const code = myCode.code;
		const offset = (page - 1) * PAGE_SIZE;
		if (myCode.status === 'ready' && code) untrack(() => void view.load(code, offset));
	});

	function pageHref(target: number): string {
		return target <= 1 ? resolve('/matches') : `${resolve('/matches')}?page=${target}`;
	}

	// The title changes with the page, so a screen reader hears that a new page loaded. The total is
	// known once a page has loaded.
	const totalPages = $derived(
		view.status === 'ready' && view.count > 0 ? Math.ceil(view.count / PAGE_SIZE) : null
	);
	const title = $derived(
		totalPages === null
			? `Matches, page ${page} · OPEN Pickleball`
			: `Matches, page ${page} of ${totalPages} · OPEN Pickleball`
	);

	const hasNewer = $derived(view.offset > 0);
	const hasOlder = $derived(view.offset + view.items.length < view.count);
	const newerPage = $derived(Math.floor(view.offset / PAGE_SIZE));
	const olderPage = $derived(Math.floor(view.offset / PAGE_SIZE) + 2);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<h1 class="page-title">Matches</h1>

<CodeGate>
	{#snippet children(you)}
		{#if view.status === 'ready' && view.count > 0}
			<p class="mt-3 max-w-[56ch] text-muted">
				{matchCountLabel(view.count)}, newest first. Other signed-in players see only your confirmed
				matches.
			</p>
		{/if}

		{#if view.status === 'error'}
			<div class="mt-7">
				<LoadError kind={view.errorKind} onretry={() => view.load(you, (page - 1) * PAGE_SIZE)} />
			</div>
		{:else if view.status === 'loading'}
			<p class="mt-8 text-muted" role="status">Loading your matches…</p>
		{:else if view.count === 0}
			<EmptyMatches />
		{:else if view.items.length === 0}
			<!-- A page number past the end, such as an old link. -->
			<section class="mt-8 grid justify-items-start gap-3">
				<p class="text-muted">There are no matches on this page.</p>
				<Button href={resolve('/matches')} variant="outline" size="sm">Back to the newest</Button>
			</section>
		{:else}
			<section
				class="mt-7"
				aria-label="Page {Math.floor(view.offset / PAGE_SIZE) + 1} of {Math.ceil(
					view.count / PAGE_SIZE
				)}"
			>
				<MatchList matches={view.matches} {you} label="Your matches" />
				<nav class="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
					<span class="text-[15px] text-muted" data-testid="range"
						>{rangeLabel(view.offset, view.items.length, view.count)}</span
					>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" href={pageHref(newerPage)} disabled={!hasNewer}>
							Newer
						</Button>
						<Button variant="outline" size="sm" href={pageHref(olderPage)} disabled={!hasOlder}>
							Older
						</Button>
					</div>
				</nav>
			</section>
		{/if}
	{/snippet}
</CodeGate>
