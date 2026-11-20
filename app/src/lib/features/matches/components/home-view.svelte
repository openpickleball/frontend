<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES, needsViewerConfirmation, waitingOnOtherTeam } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import { matchCache } from '../cache.svelte.js';
	import { listAwaitingConfirmation } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import CodeStrip from './code-strip.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import LoadError from './load-error.svelte';
	import MatchList from './match-list.svelte';
	import Notice from './notice.svelte';

	/** How many recent matches the home screen shows. "All matches" has the rest. */
	const RECENT = 5;

	const view = new MatchListView();
	// The matches that wait for the player, from their own endpoint, so an old one still shows.
	const awaiting = new MatchListView(matchCache, (_player, offset, options) =>
		listAwaitingConfirmation(offset, options)
	);
	onDestroy(() => {
		view.cancel();
		awaiting.cancel();
	});

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) {
			untrack(() => {
				void view.load(code);
				void awaiting.load(code);
			});
		}
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// The page fails as a whole only when the history does. If just the awaiting list fails, the
	// history sections still show, with a small notice where "Needs your confirmation" would be.
	// Retrying only that list does not put the whole page back to loading.
	let retryingAwaiting = $state(false);
	const status = $derived(
		view.status === 'error'
			? 'error'
			: view.status === 'loading' || (awaiting.status === 'loading' && !retryingAwaiting)
				? 'loading'
				: 'ready'
	);
	const awaitingFailed = $derived(awaiting.status === 'error');
	const offline = $derived(view.offline || (awaiting.offline && !retryingAwaiting));

	// Matches that need the player. A confirm on a match page updates the cached copy, so a match
	// the player just confirmed drops out of the list.
	const needs = $derived(awaiting.matches.filter(needsViewerConfirmation));
	// How many the first page left out.
	const moreNeeds = $derived(Math.max(0, awaiting.count - awaiting.items.length));
	// Matches the player's team confirmed. This looks only at the newest page (20 matches) of the
	// history. An older one shows under "All matches".
	const waiting = $derived(view.matches.filter(waitingOnOtherTeam));
	const recent = $derived(
		view.matches
			.filter(
				(match) =>
					!needs.some((item) => item.code === match.code) &&
					!waiting.some((item) => item.code === match.code)
			)
			.slice(0, RECENT)
	);
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
						void view.load(you);
						void awaiting.load(you);
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
						<Notice
							kind={awaiting.offline ? 'offline' : 'error'}
							title="We couldn't check what needs your confirmation."
							onretry={() => {
								retryingAwaiting = true;
								void awaiting.load(you);
							}}
						>
							The rest of your matches are below. Try again to see what needs you.
						</Notice>
					</div>
				{:else if needs.length > 0}
					<section class="mt-12" aria-labelledby="needs-title">
						<div class="flex items-baseline justify-between gap-4">
							<h2 id="needs-title" class="text-2xl font-semibold tracking-tight">
								Needs your confirmation
							</h2>
							<span class="text-base text-muted">{matchCountLabel(needs.length + moreNeeds)}</span>
						</div>
						<p class="mt-2 mb-4 text-base text-muted">
							Check the score. Confirm it if it's right, or dispute it if it's wrong.
						</p>
						<MatchList matches={needs} {you} label="Needs your confirmation" />
						{#if moreNeeds > 0}
							<p class="mt-3 text-base text-muted" data-testid="more-needs">
								{moreNeeds === 1 ? '1 more match is' : `${moreNeeds} more matches are`} waiting for you.
								<a
									href={resolve(ROUTES.matches)}
									class="underline underline-offset-4 hover:text-secondary">See all matches</a
								>.
							</p>
						{/if}
					</section>
				{/if}

				{#if waiting.length > 0}
					<section class="mt-12" aria-labelledby="waiting-title">
						<div class="flex items-baseline justify-between gap-4">
							<h2 id="waiting-title" class="text-2xl font-semibold tracking-tight">
								Waiting for the other team
							</h2>
							<span class="text-base text-muted">{matchCountLabel(waiting.length)}</span>
						</div>
						<p class="mt-2 mb-4 text-base text-muted">
							Your team confirmed these scores. A match counts once a player on the other team
							confirms it too.
						</p>
						<MatchList matches={waiting} {you} label="Waiting for the other team" />
					</section>
				{/if}

				<section class="mt-12" aria-labelledby="recent-title">
					<div class="flex items-baseline justify-between gap-4">
						<h2 id="recent-title" class="text-2xl font-semibold tracking-tight">Recent matches</h2>
						<Button href={resolve(ROUTES.matches)} variant="link">
							All matches
							<ArrowRightIcon aria-hidden="true" />
						</Button>
					</div>
					<div class="mt-4">
						{#if recent.length > 0}
							<MatchList matches={recent} {you} label="Recent matches" />
						{:else}
							<p class="text-muted">Your other matches show up here.</p>
						{/if}
					</div>
				</section>
			{/if}
		{/if}
	{/snippet}
</CodeGate>
