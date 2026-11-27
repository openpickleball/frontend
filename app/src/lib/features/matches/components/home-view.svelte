<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES, needsViewerConfirmation, waitingOnOtherTeam } from '#lib/domain/index.js';
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
	import { matchesQuery } from '../filter.js';
	import { listAwaitingConfirmation, listMyDisputes, listMyHolds } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import CodeStrip from './code-strip.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';

	/** How many recent matches the home screen shows. "All matches" has the rest. */
	const RECENT = 5;

	const view = new MatchListView();
	// The matches that wait for the player, from their own endpoint, so an old one still shows.
	const awaiting = new MatchListView(matchCache, (_player, offset, options) =>
		listAwaitingConfirmation(offset, options)
	);
	// The player's disputed matches, whoever disputed them, from their own endpoint too.
	const disputed = new MatchListView(matchCache, (_player, offset, options) =>
		listMyDisputes(offset, options)
	);
	// The held matches the player may vouch for. The list says whether their side vouched, and the
	// cache keeps that next to each match.
	const held = new MatchListView(matchCache, async (_player, offset, options) => {
		const page = await listMyHolds(offset, options);
		return { items: page.items.map((hold) => hold.match), count: page.count };
	});
	onDestroy(() => {
		view.cancel();
		awaiting.cancel();
		disputed.cancel();
		held.cancel();
	});

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) {
			untrack(() => {
				void view.load(code);
				void awaiting.load(code);
				void disputed.load(code);
				void held.load(code);
			});
		}
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// The page fails as a whole only when the history does. If just the awaiting or the disputed
	// list fails, the history sections still show, with a small notice where that list would be.
	// Retrying only that list does not put the whole page back to loading.
	let retryingAwaiting = $state(false);
	let retryingDisputed = $state(false);
	let retryingHeld = $state(false);
	const status = $derived(
		view.status === 'error'
			? 'error'
			: view.status === 'loading' ||
				  (awaiting.status === 'loading' && !retryingAwaiting) ||
				  (disputed.status === 'loading' && !retryingDisputed) ||
				  (held.status === 'loading' && !retryingHeld)
				? 'loading'
				: 'ready'
	);
	const awaitingFailed = $derived(awaiting.status === 'error');
	const disputedFailed = $derived(disputed.status === 'error');
	const heldFailed = $derived(held.status === 'error');
	const offline = $derived(
		view.offline ||
			(awaiting.offline && !retryingAwaiting) ||
			(disputed.offline && !retryingDisputed) ||
			(held.offline && !retryingHeld)
	);

	// Matches that need the player. A confirm on a match page updates the cached copy, so a match
	// the player just confirmed drops out of the list.
	const needs = $derived(awaiting.matches.filter(needsViewerConfirmation));
	// How many the first page left out.
	const moreNeeds = $derived(Math.max(0, awaiting.count - awaiting.items.length));
	// Matches the player's team confirmed. This looks only at the newest page (20 matches) of the
	// history. An older one shows under "All matches".
	const waiting = $derived(view.matches.filter(waitingOnOtherTeam));
	// Disputed matches. A withdraw on a match page updates the cached copy, so a match that is no
	// longer disputed drops out of the list. One that another player still disputes stays.
	const disputes = $derived(disputed.matches.filter((match) => match.status === 'disputed'));
	const moreDisputes = $derived(Math.max(0, disputed.count - disputed.items.length));
	// Held matches. A vouch that ends the hold drops the match from the cache's holds, so it leaves
	// the list. One whose side vouched stays until the hold ends. A match listed above already, to
	// confirm or as disputed, is not listed again: its row says it is on hold.
	const above = $derived(new Set([...needs, ...disputes].map((match) => match.code)));
	const holds = $derived(
		held.matches.filter(
			(match) =>
				match.status !== 'voided' &&
				matchCache.holdOf(match.code) !== undefined &&
				!above.has(match.code)
		)
	);
	const moreHolds = $derived(Math.max(0, held.count - held.items.length));
	const heldCodes = $derived(new Set(holds.map((match) => match.code)));
	// Waiting for the other team leaves out held matches, which have their own section.
	const waitingShown = $derived(waiting.filter((match) => !heldCodes.has(match.code)));
	const shown = $derived(
		new Set([...needs, ...disputes, ...holds, ...waitingShown].map((match) => match.code))
	);
	const recent = $derived(view.matches.filter((match) => !shown.has(match.code)).slice(0, RECENT));
</script>

<h1 class="page-title">{greeting}</h1>

<CodeGate>
	{#snippet children(you)}
		{#if status === 'error'}
			<div class="mt-8">
				<LoadError
					kind={offline ? 'network' : view.errorKind}
					onretry={() => {
						retryingAwaiting = false;
						retryingDisputed = false;
						retryingHeld = false;
						void view.load(you);
						void awaiting.load(you);
						void disputed.load(you);
						void held.load(you);
					}}
				/>
			</div>
		{/if}

		<CodeStrip code={you} />

		<div class="mt-8">
			<Button href={resolve(ROUTES.record)} disabled={offline}>
				Record a match
				<ArrowRightIcon aria-hidden="true" />
			</Button>
		</div>

		{#if status === 'loading'}
			<LoadingState label="Loading your matches…" variant="list" rows={2} class="mt-8" />
		{:else if status === 'ready'}
			{#if view.count === 0}
				<EmptyMatches onHome />
			{:else}
				{#if awaitingFailed}
					<div class="mt-12" data-testid="needs-error">
						<Alert variant={awaiting.offline ? 'default' : 'destructive'}>
							{#if awaiting.offline}
								<WifiOffIcon aria-hidden="true" />
							{:else}
								<CircleAlertIcon aria-hidden="true" />
							{/if}
							<AlertTitle>We couldn't check what needs your confirmation.</AlertTitle>
							<AlertDescription>
								The rest of your matches are below. Try again to see what needs you.
							</AlertDescription>
							<AlertAction>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										retryingAwaiting = true;
										void awaiting.load(you);
									}}
								>
									Try again
								</Button>
							</AlertAction>
						</Alert>
					</div>
				{:else if needs.length > 0}
					<Section title="Needs your confirmation">
						{#snippet aside()}
							<span class="text-base text-muted">{matchCountLabel(needs.length + moreNeeds)}</span>
						{/snippet}
						<MatchList
							matches={needs}
							{you}
							label="Needs your confirmation"
							listOf="needs-you"
							underTitle
							inSection
						/>
						{#if moreNeeds > 0}
							<p class="mt-3 text-base text-muted" data-testid="more-needs">
								{moreNeeds === 1 ? '1 more match is' : `${moreNeeds} more matches are`} waiting for you.
								<Button
									variant="link"
									size="inline"
									href={`${resolve(ROUTES.matches)}${matchesQuery('needs-you')}`}
								>
									See them all
								</Button>.
							</p>
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
				{:else if disputes.length > 0}
					<Section title="Disputed matches">
						{#snippet aside()}
							<span class="text-base text-muted">
								{matchCountLabel(disputes.length + moreDisputes)}
							</span>
						{/snippet}
						<MatchList
							matches={disputes}
							{you}
							label="Disputed matches"
							listOf="disputed"
							underTitle
							inSection
						/>
						{#if moreDisputes > 0}
							<p class="mt-3 text-base text-muted" data-testid="more-disputes">
								{moreDisputes === 1
									? '1 more disputed match is'
									: `${moreDisputes} more disputed matches are`} in your history.
								<Button
									variant="link"
									size="inline"
									href={`${resolve(ROUTES.matches)}${matchesQuery('disputed')}`}
								>
									See them all
								</Button>.
							</p>
						{/if}
					</Section>
				{/if}

				{#if heldFailed}
					<div class="mt-12" data-testid="holds-error">
						<Alert variant={held.offline ? 'default' : 'destructive'}>
							{#if held.offline}
								<WifiOffIcon aria-hidden="true" />
							{:else}
								<CircleAlertIcon aria-hidden="true" />
							{/if}
							<AlertTitle>We couldn't check your matches on hold.</AlertTitle>
							<AlertDescription>
								The rest of your matches are below. Try again to see which are on hold.
							</AlertDescription>
							<AlertAction>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										retryingHeld = true;
										void held.load(you);
									}}
								>
									Try again
								</Button>
							</AlertAction>
						</Alert>
					</div>
				{:else if holds.length > 0}
					<Section title="Matches on hold">
						{#snippet aside()}
							<span class="text-base text-muted">{matchCountLabel(holds.length + moreHolds)}</span>
						{/snippet}
						<MatchList
							matches={holds}
							{you}
							label="Matches on hold"
							listOf="on-hold"
							underTitle
							inSection
						/>
						{#if moreHolds > 0}
							<p class="mt-3 text-base text-muted" data-testid="more-holds">
								{moreHolds === 1
									? '1 more match is on hold.'
									: `${moreHolds} more matches are on hold.`}
								<Button
									variant="link"
									size="inline"
									href={`${resolve(ROUTES.matches)}${matchesQuery('on-hold')}`}
								>
									See them all
								</Button>.
							</p>
						{/if}
					</Section>
				{/if}

				{#if waitingShown.length > 0}
					<Section title="Waiting for the other team">
						{#snippet aside()}
							<span class="text-base text-muted">{matchCountLabel(waitingShown.length)}</span>
						{/snippet}
						<MatchList
							matches={waitingShown}
							{you}
							label="Waiting for the other team"
							listOf="waiting"
							underTitle
							inSection
						/>
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
		{/if}
	{/snippet}
</CodeGate>
