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
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { keepScroll } from '../keep-scroll.svelte.js';
	import { matchesQuery } from '../filter.js';
	import { needsYou } from '../needs-you.svelte.js';
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

	// The newest page of the player's matches, for the count next to Needs you.
	const view = new MatchListView();
	onDestroy(() => {
		view.cancel();
		ratings.cancel();
	});

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) {
			untrack(() => {
				void view.load(code);
				void needsYou.load();
				void ratings.load(code);
			});
		}
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// The matches part fails as a whole only when the history does. If just Needs you fails, the
	// count still shows, with a small notice where the rows would be. Retrying only Needs you does
	// not put the whole part back to loading. The code and the ratings above load on their own.
	let retryingNeeds = $state(false);
	const status = $derived(
		view.status === 'error'
			? 'error'
			: view.status === 'loading' || (needsYou.status === 'loading' && !retryingNeeds)
				? 'loading'
				: 'ready'
	);
	// Back on Home, the page is back where the player left it once its matches and the ratings above
	// them have loaded, so it has its full height.
	keepScroll('home', () => status !== 'loading' && !ratings.loading);
	const needsFailed = $derived(needsYou.status === 'error');
	const offline = $derived(view.offline || (needsYou.offline && !retryingNeeds));

	// What needs the player, oldest first: the same list as the nav badge and the Needs you filter.
	// A confirm or vouch on a match page updates the cache, so the match leaves the list at once.
	const needs = $derived(needsYou.matches);
	const needsShown = $derived(needs.slice(0, SHOWN));
	const needsAllHref = `${resolve(ROUTES.matches)}${matchesQuery('needs-you')}`;
</script>

<h1 class="page-title">{greeting}</h1>

<!-- The code, the ratings, then what needs the player. Each block brings its own space above. -->
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
						void view.load(you);
						void needsYou.load();
					}}
				/>
			</div>
		{:else if status === 'loading'}
			<LoadingState label="Loading your matches…" variant="list" rows={2} class="mt-12" />
		{:else if view.count === 0}
			<EmptyMatches onHome class="mt-12" />
		{:else}
			<!-- Only what needs the player, with the same rows as Matches. Every other match is in All
			     on Matches, which the count next to the title opens. -->
			<Section title="Needs you">
				{#snippet aside()}
					<!-- Every match the player is in, as Matches lists them. -->
					<Button href={resolve(ROUTES.matches)} variant="link" data-testid="all-matches">
						{matchCountLabel(view.count)}
						<ArrowRightIcon aria-hidden="true" />
					</Button>
				{/snippet}
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
					<MatchList matches={needsShown} {you} label="Needs you" underTitle inSection />
					{#if needs.length > SHOWN}
						<!-- -ml-1 takes back the link's px-1, so its text lines up with the rows above. -->
						<div class="mt-4">
							<Button variant="link" href={needsAllHref} class="-ml-1" data-testid="see-all-needs">
								See all {needs.length} in Matches
								<ArrowRightIcon aria-hidden="true" />
							</Button>
						</div>
					{/if}
				{:else}
					<p class="text-muted" data-testid="caught-up">Nothing to confirm or vouch for.</p>
				{/if}
			</Section>
		{/if}
	{/snippet}
</CodeGate>
