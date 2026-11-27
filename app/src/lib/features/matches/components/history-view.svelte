<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { SettingsStore, myCode, type SettingsDeps } from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '#lib/ui/empty/index.js';
	import { Label } from '#lib/ui/label/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { NativeSelect, NativeSelectOption } from '#lib/ui/native-select/index.js';
	import { matchCache } from '../cache.svelte.js';
	import {
		MATCH_FILTERS,
		fetcherFor,
		filterLabel,
		matchesQuery,
		type MatchFilter
	} from '../filter.js';
	import { rangeLabel, matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { PAGE_SIZE, listMyHolds } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/**
	 * `page` is 1 for the newest matches, 2 for the next 20, and so on. `show` is the filter, from
	 * `?show=` in the address, and paging stays within it.
	 */
	let {
		page = 1,
		show = 'all',
		settingsDeps = {}
	}: {
		page?: number;
		show?: MatchFilter;
		/** For tests. The page uses the real services. */
		settingsDeps?: Partial<SettingsDeps>;
	} = $props();

	// One list per filter, each from its own backend list. Switching filters keeps this component, so
	// each list keeps its own late-answer guard.
	const views = Object.fromEntries(
		MATCH_FILTERS.map(({ value }) => [value, new MatchListView(matchCache, fetcherFor(value))])
	) as Record<MatchFilter, MatchListView>;
	const view = $derived(views[show]);
	onDestroy(() => Object.values(views).forEach((list) => list.cancel()));

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
		const list = view;
		if (myCode.status === 'ready' && code) untrack(() => void list.load(code, offset));
	});

	// The rows say when a match is on hold, which only the holds list knows. One large page covers
	// almost every player. The rows just leave the note out when it fails.
	$effect(() => {
		if (myCode.status === 'ready' && myCode.code) {
			untrack(() => void listMyHolds(0, { limit: 100 }).catch(() => {}));
		}
	});

	function pageHref(target: number, filter: MatchFilter = show): string {
		return `${resolve(ROUTES.matches)}${matchesQuery(filter, target)}`;
	}

	// The filter changes the address, so a reload or a shared link keeps it. It starts again at
	// the first page of the new list.
	function choose(event: Event & { currentTarget: HTMLSelectElement }) {
		const filter = event.currentTarget.value as MatchFilter;
		// The path is resolve(ROUTES.matches). Only the query is added, which resolve() doesn't take.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- see the line above
		void goto(`${resolve(ROUTES.matches)}${matchesQuery(filter)}`, { reset: false });
	}

	/** What an empty filter says. */
	const NONE: Record<Exclude<MatchFilter, 'all'>, string> = {
		'needs-you': 'No matches need your confirmation',
		disputed: 'You have no disputed matches',
		'on-hold': 'You have no matches on hold'
	};

	// The title changes with the page, so a screen reader hears that a new page loaded. The total is
	// known once a page with matches has loaded. A page past the end has no matches, so it never
	// reads "page 99 of 2".
	const totalPages = $derived(
		view.status === 'ready' && view.items.length > 0 ? Math.ceil(view.count / PAGE_SIZE) : null
	);
	const pastTheEnd = $derived(view.status === 'ready' && view.count > 0 && view.items.length === 0);
	const titleStart = $derived(show === 'all' ? 'Matches' : `Matches, ${filterLabel(show)}`);
	const title = $derived(
		pastTheEnd
			? `${titleStart}, no matches on this page · OPEN Pickleball`
			: totalPages === null
				? `${titleStart}, page ${page} · OPEN Pickleball`
				: `${titleStart}, page ${page} of ${totalPages} · OPEN Pickleball`
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
		<div class="mt-4 grid max-w-md gap-2">
			<Label for="matches-show">Show</Label>
			<NativeSelect id="matches-show" value={show} onchange={choose}>
				{#each MATCH_FILTERS as option (option.value)}
					<NativeSelectOption value={option.value}>{option.label}</NativeSelectOption>
				{/each}
			</NativeSelect>
		</div>

		{#if view.status === 'ready' && view.count > 0}
			<!-- A filter shows the count alone. Who sees the matches is said once, under All. -->
			<p class="mt-4 max-w-md text-muted">
				{matchCountLabel(view.count)}, newest first.
				{#if show === 'all' && visibility === 'private'}
					Only you can see your matches.
				{:else if show === 'all' && visibility === 'signed_in'}
					Other signed-in players see your confirmed matches.
				{/if}
				{#if show === 'all' && visibility !== null}
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
		{:else if view.count === 0 && show !== 'all'}
			<Empty class="mt-8">
				<EmptyHeader>
					<EmptyTitle>{NONE[show]}</EmptyTitle>
				</EmptyHeader>
				<EmptyContent>
					<Button href={pageHref(1, 'all')} variant="outline">See all matches</Button>
				</EmptyContent>
			</Empty>
		{:else if view.count === 0}
			<EmptyMatches />
		{:else if view.items.length === 0}
			<!-- A page number past the end, such as an old link. -->
			<Empty class="mt-8">
				<EmptyHeader>
					<EmptyTitle>There are no matches on this page</EmptyTitle>
				</EmptyHeader>
				<EmptyContent>
					<Button href={pageHref(1)} variant="outline">Back to the newest</Button>
				</EmptyContent>
			</Empty>
		{:else}
			<section
				class="mt-8"
				aria-label="Page {Math.floor(view.offset / PAGE_SIZE) + 1} of {Math.ceil(
					view.count / PAGE_SIZE
				)}"
			>
				<MatchList
					matches={view.matches}
					{you}
					label={show === 'all' ? 'Your matches' : `Your matches, ${filterLabel(show)}`}
				/>
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
