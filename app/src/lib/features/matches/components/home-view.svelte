<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { matchCache } from '../cache.svelte.js';
	import { matchesQuery, type MatchFilter } from '../filter.js';
	import { needsYou } from '../needs-you.svelte.js';
	import { listMyDisputes } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import CodeStrip from './code-strip.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/**
	 * How many rows Needs you and Recent matches show. Home stays short by design: "See all" and
	 * "All matches" have the rest.
	 */
	const SHOWN = 3;

	const view = new MatchListView();
	// The player's disputed matches, whoever disputed them, for the count under In progress.
	const disputed = new MatchListView(matchCache, (_player, offset, options) =>
		listMyDisputes(offset, options)
	);
	onDestroy(() => {
		view.cancel();
		disputed.cancel();
	});

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) {
			untrack(() => {
				void view.load(code);
				void needsYou.load();
				void disputed.load(code);
			});
		}
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// The page fails as a whole only when the history does. If just Needs you or the disputed list
	// fails, the rest still shows, with a small notice where that part would be. Retrying only that
	// part does not put the whole page back to loading.
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
	// Recent matches leave out what needs the player, so a match shows once.
	const needCodes = $derived(new Set(needs.map((match) => match.code)));
	const recent = $derived(
		view.matches.filter((match) => !needCodes.has(match.code)).slice(0, SHOWN)
	);

	const filterHref = (filter: MatchFilter) => `${resolve(ROUTES.matches)}${matchesQuery(filter)}`;
</script>

<h1 class="page-title">{greeting}</h1>

<CodeGate>
	{#snippet children(you)}
		{#if status === 'error'}
			<div class="mt-8">
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
			<LoadingState label="Loading your matches…" variant="list" rows={2} class="mt-8" />
		{:else if view.count === 0}
			<EmptyMatches onHome />
		{:else}
			{#if needsFailed}
				<div class="mt-8" data-testid="needs-error">
					<Alert variant={needsYou.offline ? 'default' : 'destructive'}>
						{#if needsYou.offline}
							<WifiOffIcon aria-hidden="true" />
						{:else}
							<CircleAlertIcon aria-hidden="true" />
						{/if}
						<AlertTitle>We couldn't check what needs you.</AlertTitle>
						<AlertDescription>
							The rest of your matches are below. Try again to see what needs you.
						</AlertDescription>
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
			{:else}
				<Section title="Needs you" class="mt-8">
					{#snippet aside()}
						{#if needs.length > 0}
							<span class="text-base text-muted">{matchCountLabel(needs.length)}</span>
						{/if}
					{/snippet}
					{#if needs.length > 0}
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
					{:else}
						<p class="text-muted" data-testid="caught-up">You're all caught up.</p>
					{/if}
				</Section>
			{/if}

			{#if disputedFailed}
				<div class="mt-12" data-testid="disputes-error">
					<Alert variant={disputed.offline ? 'default' : 'destructive'}>
						{#if disputed.offline}
							<WifiOffIcon aria-hidden="true" />
						{:else}
							<CircleAlertIcon aria-hidden="true" />
						{/if}
						<AlertTitle>We couldn't check your disputed matches.</AlertTitle>
						<AlertDescription>
							The rest of your matches are below. Try again to see which are disputed.
						</AlertDescription>
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
				<Section title="In progress">
					<p class="text-muted" data-testid="in-progress">
						{#each progress as item, index (item.filter)}
							{#if index > 0}<span aria-hidden="true">&nbsp;·&nbsp;</span>{/if}
							<Button variant="link" size="inline" href={filterHref(item.filter)}>
								{item.count}
								{item.label}
							</Button>
						{/each}
					</p>
				</Section>
			{/if}

			<Section title="Recent matches">
				{#snippet aside()}
					<Button href={resolve(ROUTES.matches)} variant="link">
						All matches
						<ArrowRightIcon aria-hidden="true" />
					</Button>
				{/snippet}
				{#if recent.length > 0}
					<MatchList matches={recent} {you} label="Recent matches" underTitle inSection />
				{:else}
					<p class="text-muted">Your other matches show up here.</p>
				{/if}
			</Section>
		{/if}

		<CodeStrip code={you} class={status === 'ready' && view.count > 0 ? 'mt-12' : 'mt-8'} />

		{#if !(status === 'ready' && view.count === 0)}
			<!-- The empty state above has its own Record a match button. -->
			<div class="mt-8">
				<Button href={resolve(ROUTES.record)} disabled={offline}>
					Record a match
					<ArrowRightIcon aria-hidden="true" />
				</Button>
			</div>
		{/if}
	{/snippet}
</CodeGate>
