<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { SettingsStore, myCode, type SettingsDeps } from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '#lib/ui/empty/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { rangeLabel, matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { PAGE_SIZE, listMyHolds } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/** `page` is 1 for the newest matches, 2 for the next 20, and so on. */
	let {
		page = 1,
		settingsDeps = {}
	}: {
		page?: number;
		/** For tests. The page uses the real services. */
		settingsDeps?: Partial<SettingsDeps>;
	} = $props();

	const view = new MatchListView();
	onDestroy(() => view.cancel());

	// Who sees the matches is the Match history setting. The profile reads it from the same
	// `me/player`, with the same store. Until it has loaded, or when it fails, the page says
	// nothing about it rather than guess.
	const settings = untrack(() => new SettingsStore(settingsDeps));
	let settingsFor: string | null = null;
	$effect(() => {
		const code = myCode.status === 'ready' ? myCode.code : null;
		if (code === null || code === settingsFor) return;
		settingsFor = code;
		untrack(() => void settings.load());
	});
	const visibility = $derived(
		settings.status === 'ready' && settings.privacy ? settings.privacy.match_history : null
	);

	$effect(() => {
		const code = myCode.code;
		const offset = (page - 1) * PAGE_SIZE;
		if (myCode.status === 'ready' && code) untrack(() => void view.load(code, offset));
	});

	// The rows say when a match is on hold, which only the holds list knows. One large page covers
	// almost every player. The rows just leave the note out when it fails.
	$effect(() => {
		if (myCode.status === 'ready' && myCode.code) {
			untrack(() => void listMyHolds(0, { limit: 100 }).catch(() => {}));
		}
	});

	function pageHref(target: number): string {
		return target <= 1 ? resolve(ROUTES.matches) : `${resolve(ROUTES.matches)}?page=${target}`;
	}

	// The title changes with the page, so a screen reader hears that a new page loaded. The total is
	// known once a page with matches has loaded. A page past the end has no matches, so it never
	// reads "page 99 of 2".
	const totalPages = $derived(
		view.status === 'ready' && view.items.length > 0 ? Math.ceil(view.count / PAGE_SIZE) : null
	);
	const pastTheEnd = $derived(view.status === 'ready' && view.count > 0 && view.items.length === 0);
	const title = $derived(
		pastTheEnd
			? 'Matches, no matches on this page · OPEN Pickleball'
			: totalPages === null
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
			<p class="mt-4 max-w-md text-muted">
				{matchCountLabel(view.count)}, newest first.
				{#if visibility === 'private'}
					Only you can see your matches.
				{:else if visibility === 'signed_in'}
					Other signed-in players see your confirmed matches.
				{/if}
				{#if visibility !== null}
					<a href="{resolve(ROUTES.profile)}#settings-heading" class="underline">
						Change who sees them
					</a>
				{/if}
			</p>
		{/if}

		{#if view.status === 'error'}
			<div class="mt-8">
				<LoadError kind={view.errorKind} onretry={() => view.load(you, (page - 1) * PAGE_SIZE)} />
			</div>
		{:else if view.status === 'loading'}
			<LoadingState label="Loading your matches…" variant="list" class="mt-8" />
		{:else if view.count === 0}
			<EmptyMatches />
		{:else if view.items.length === 0}
			<!-- A page number past the end, such as an old link. -->
			<Empty class="mt-8">
				<EmptyHeader>
					<EmptyTitle>There are no matches on this page</EmptyTitle>
				</EmptyHeader>
				<EmptyContent>
					<Button href={resolve(ROUTES.matches)} variant="outline">Back to the newest</Button>
				</EmptyContent>
			</Empty>
		{:else}
			<section
				class="mt-8"
				aria-label="Page {Math.floor(view.offset / PAGE_SIZE) + 1} of {Math.ceil(
					view.count / PAGE_SIZE
				)}"
			>
				<MatchList matches={view.matches} {you} label="Your matches" />
				<nav class="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
					<span class="text-base text-muted" data-testid="range">
						{rangeLabel(view.offset, view.items.length, view.count)}
					</span>
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
