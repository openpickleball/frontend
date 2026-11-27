<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { CodeStrip, MyRatings, RatingsCard, myCode } from '#lib/features/players/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { InfoPopover } from '#lib/ui/info-popover/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { matchCache } from '../cache.svelte.js';
	import { keepScroll } from '../keep-scroll.svelte.js';
	import { matchesQuery, type MatchFilter } from '../filter.js';
	import { needsYou } from '../needs-you.svelte.js';
	import { listMyDisputes } from '../services.js';
	import { progressInfo } from '../status.js';
	import CodeGate from './code-gate.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/** How many rows Needs you shows. Home stays short by design: "See all" has the rest. */
	const SHOWN = 3;

	let {
		ratings = new MyRatings()
	}: {
		/** The player's current ratings. For tests: the page loads the real ones. */
		ratings?: MyRatings;
	} = $props();

	// The newest page of the player's matches, for the count next to In progress.
	const view = new MatchListView();
	// The player's disputed matches, whoever disputed them, for the count under In progress.
	const disputed = new MatchListView(matchCache, (_player, offset, options) =>
		listMyDisputes(offset, options)
	);
	onDestroy(() => {
		view.cancel();
		disputed.cancel();
		ratings.cancel();
	});

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) {
			untrack(() => {
				void view.load(code);
				void needsYou.load();
				void disputed.load(code);
				void ratings.load(code);
			});
		}
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// The matches part fails as a whole only when the history does. If just Needs you or the
	// disputed list fails, the rest still shows, with a small notice where that part would be.
	// Retrying only that part does not put the whole part back to loading. The code and the
	// ratings above load on their own.
	let retryingNeeds = $state(false);
	let retryingDisputed = $state(false);
	const status = $derived(
		view.status === 'error'
			? 'error'
			: view.status === 'loading' ||
				  (needsYou.status === 'loading' && !retryingNeeds) ||
				  (disputed.status === 'loading' && !retryingDisputed)
				? 'loading'
				: 'ready'
	);
	// Back on Home, the page is back where the player left it once its matches and the ratings above
	// them have loaded, so it has its full height.
	keepScroll('home', () => status !== 'loading' && !ratings.loading);
	const needsFailed = $derived(needsYou.status === 'error');
	const disputedFailed = $derived(disputed.status === 'error');
	const offline = $derived(
		view.offline || (needsYou.offline && !retryingNeeds) || (disputed.offline && !retryingDisputed)
	);

	// What needs the player, oldest first: the same list as the nav badge and the Needs you filter.
	// A confirm or vouch on a match page updates the cache, so the match leaves the list at once.
	const needs = $derived(needsYou.matches);
	const needsShown = $derived(needs.slice(0, SHOWN));
	// Disputed matches. A withdraw on a match page updates the cached copy, so a match that is no
	// longer disputed drops out of the count. One that another player still disputes stays, and so
	// does one the player can withdraw: withdrawing is optional.
	const disputes = $derived(disputed.matches.filter((match) => match.status === 'disputed'));
	const disputedCount = $derived(
		disputes.length + Math.max(0, disputed.count - disputed.items.length)
	);
	// Every hold the player may vouch for, as the On hold filter lists them, from the full read.
	const heldCount = $derived(needsYou.held.length);
	// The counts under In progress, each linking to its filter. There is no "waiting for the other
	// team" count: the backend has no such list, and the newest page of the history can't give a
	// true total.
	const progress = $derived(
		(
			[
				{ filter: 'disputed', count: disputedFailed ? 0 : disputedCount, label: 'disputed' },
				{ filter: 'on-hold', count: needsFailed ? 0 : heldCount, label: 'on hold' }
			] satisfies { filter: MatchFilter; count: number; label: string }[]
		).filter((item) => item.count > 0)
	);
	// Disputed and on hold explained, for the counts the line shows. Vouch is part of on hold: a
	// held match to vouch for is always counted there too.
	const progressHelp = $derived(
		progressInfo(
			progress.some((item) => item.filter === 'disputed'),
			progress.some((item) => item.filter === 'on-hold')
		)
	);
	const filterHref = (filter: MatchFilter) => `${resolve(ROUTES.matches)}${matchesQuery(filter)}`;
</script>

<h1 class="page-title">{greeting}</h1>

<!-- The code, the ratings, then what is in progress. Each block brings its own space above. -->
<CodeGate>
	{#snippet children(you)}
		<CodeStrip code={you} />

		<RatingsCard
			details
			compact
			ratings={ratings.ratings}
			loading={ratings.loading}
			failed={ratings.failed}
		/>

		{#if status === 'error'}
			<div class="mt-12">
				<LoadError
					kind={offline ? 'network' : view.errorKind}
					onretry={() => {
						retryingNeeds = false;
						retryingDisputed = false;
						void view.load(you);
						void needsYou.load();
						void disputed.load(you);
					}}
				/>
			</div>
		{:else if status === 'loading'}
			<LoadingState label="Loading your matches…" variant="list" rows={2} class="mt-12" />
		{:else if view.count === 0}
			<EmptyMatches onHome class="mt-12" />
		{:else}
			<Section title="In progress">
				{#snippet info()}
					{#if progressHelp}
						<InfoPopover label={progressHelp.label} terms={progressHelp.terms} />
					{/if}
				{/snippet}
				{#snippet aside()}
					<!-- Every match the player is in, as Matches lists them. -->
					<Button href={resolve(ROUTES.matches)} variant="link" data-testid="all-matches">
						{matchCountLabel(view.count)}
						<ArrowRightIcon aria-hidden="true" />
					</Button>
				{/snippet}
				<div class="grid gap-8">
					{#if needsFailed}
						<div data-testid="needs-error">
							<Alert variant={needsYou.offline ? 'default' : 'destructive'}>
								{#if needsYou.offline}
									<WifiOffIcon aria-hidden="true" />
								{:else}
									<CircleAlertIcon aria-hidden="true" />
								{/if}
								<AlertTitle>We couldn't check what needs you.</AlertTitle>
								<AlertDescription>Try again to see what needs you.</AlertDescription>
								<AlertAction>
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											retryingNeeds = true;
											void needsYou.load();
										}}
									>
										Try again
									</Button>
								</AlertAction>
							</Alert>
						</div>
					{:else if needs.length > 0}
						<div>
							<h3 class="text-base font-semibold text-secondary">Needs you</h3>
							<MatchList
								matches={needsShown}
								{you}
								label="Needs you"
								listOf="needs-you"
								underTitle
								inSection
							/>
							{#if needs.length > SHOWN}
								<!-- -ml-1 takes back the link's px-1, so its text lines up with the rows above. -->
								<div class="mt-4">
									<Button
										variant="link"
										href={filterHref('needs-you')}
										class="-ml-1"
										data-testid="see-all-needs"
									>
										See all {needs.length}
										<ArrowRightIcon aria-hidden="true" />
									</Button>
								</div>
							{/if}
						</div>
					{:else}
						<p class="text-muted" data-testid="caught-up">You're all caught up.</p>
					{/if}

					{#if disputedFailed}
						<div data-testid="disputes-error">
							<Alert variant={disputed.offline ? 'default' : 'destructive'}>
								{#if disputed.offline}
									<WifiOffIcon aria-hidden="true" />
								{:else}
									<CircleAlertIcon aria-hidden="true" />
								{/if}
								<AlertTitle>We couldn't check your disputed matches.</AlertTitle>
								<AlertDescription>Try again to see which are disputed.</AlertDescription>
								<AlertAction>
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											retryingDisputed = true;
											void disputed.load(you);
										}}
									>
										Try again
									</Button>
								</AlertAction>
							</Alert>
						</div>
					{/if}

					{#if progress.length > 0}
						<p class="text-muted" data-testid="in-progress">
							{#each progress as item, index (item.filter)}
								{#if index > 0}<span aria-hidden="true">&nbsp;·&nbsp;</span>{/if}
								<Button variant="link" size="inline" href={filterHref(item.filter)}>
									{item.count}
									{item.label}
								</Button>
							{/each}
						</p>
					{/if}
				</div>
			</Section>
		{/if}
	{/snippet}
</CodeGate>
