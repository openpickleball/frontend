<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { isPending, myTeam } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '#lib/ui/button/index.js';
	import { matchCountLabel } from '../format.js';
	import { MatchListView } from '../list-view.svelte.js';
	import CodeGate from './code-gate.svelte';
	import CodeStrip from './code-strip.svelte';
	import EmptyMatches from './empty-matches.svelte';
	import MatchList from './match-list.svelte';
	import Notice from './notice.svelte';

	/** How many recent matches the home screen shows. "All matches" has the rest. */
	const RECENT = 5;

	const view = new MatchListView();
	onDestroy(() => view.cancel());

	$effect(() => {
		const code = myCode.code;
		if (myCode.status === 'ready' && code) untrack(() => void view.load(code));
	});

	const firstName = $derived(myCode.displayName?.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(firstName ? `Hi, ${firstName}` : 'Home');

	// Pending matches the player is in. The API cannot say who already confirmed (backend#193), so
	// the section is "Pending matches", not "needs your confirmation". A row says "Waiting on a
	// confirmation" until the player acts here, then "You confirmed this score" (see match-row).
	// This looks only at the newest page (20 matches). A pending match older than that shows in the
	// history list under "All matches".
	const pending = $derived(
		view.matches.filter(
			(match) => isPending(match) && myCode.code !== null && myTeam(match, myCode.code) !== null
		)
	);
	const recent = $derived(
		view.matches
			.filter((match) => !pending.some((needed) => needed.code === match.code))
			.slice(0, RECENT)
	);
</script>

<h1 class="page-title">{greeting}</h1>

<CodeGate>
	{#snippet children(you)}
		{#if view.status === 'error'}
			<div class="mt-6">
				<Notice
					kind={view.offline ? 'offline' : 'error'}
					title={view.offline ? "You're offline." : "Your matches didn't load."}
					onretry={() => view.load(you)}
				>
					{#if view.offline}
						Your matches need a connection. Check it, then try again.
					{:else}
						OPEN didn't respond. Check your connection, then try again.
					{/if}
				</Notice>
			</div>
		{/if}

		<CodeStrip code={you} />

		<div class="mt-7">
			<Button href={resolve('/record')} disabled={view.offline}>
				Record a match
				<ArrowRightIcon aria-hidden="true" />
			</Button>
		</div>

		{#if view.status === 'loading'}
			<p class="mt-8 text-muted" role="status">Loading your matches…</p>
		{:else if view.status === 'ready'}
			{#if view.count === 0}
				<EmptyMatches onHome />
			{:else}
				{#if pending.length > 0}
					<section class="mt-10" aria-labelledby="pending-title">
						<div class="flex items-baseline justify-between gap-4">
							<h2 id="pending-title" class="text-[22px] font-semibold tracking-tight">
								Pending matches
							</h2>
							<span class="text-[15px] text-muted">{matchCountLabel(pending.length)}</span>
						</div>
						<p class="mt-1 mb-3 text-[15px] text-muted">
							A match counts once a player on each team confirms the score. If you already
							confirmed, there's nothing more to do.
						</p>
						<MatchList matches={pending} {you} label="Pending matches" />
					</section>
				{/if}

				<section class="mt-10" aria-labelledby="recent-title">
					<div class="flex items-baseline justify-between gap-4">
						<h2 id="recent-title" class="text-[22px] font-semibold tracking-tight">
							Recent matches
						</h2>
						<Button href={resolve('/matches')} variant="link">
							All matches
							<ArrowRightIcon aria-hidden="true" />
						</Button>
					</div>
					<div class="mt-3">
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
