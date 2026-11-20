<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import { isAppError } from '#lib/api/index.js';
	import {
		ROUTES,
		needsViewerConfirmation,
		parseMatchCode,
		type Match,
		type MatchCode
	} from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '#lib/ui/empty/index.js';
	import { matchCache, type MatchAction } from '../cache.svelte.js';
	import {
		STATUS_LABELS,
		formatLongDate,
		formatName,
		matchHeadline,
		scoreLine,
		scoringName,
		viewpoint
	} from '../format.js';
	import { confirmMatch, disputeMatch, getMatch } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import DisputeDialog from './dispute-dialog.svelte';
	import Notice from './notice.svelte';
	import Scoreboard from './scoreboard.svelte';
	import StatusPanel from './status-panel.svelte';

	/** The match code from the address, as typed. */
	let { code: raw }: { code: string } = $props();

	const parsed = $derived(parseMatchCode(raw));
	const code = $derived(parsed.ok ? parsed.value : null);

	// Reading the match from the API. A cached copy shows meanwhile, and the response replaces it.
	// `missing` is a 404: the API says the same for a match the player was not in and an unknown
	// code. `signed-out` is a 401. The result belongs to one code, so a result for the code the
	// page just left is ignored. `fetched` is the response itself, for when the cache won't keep it.
	type Result = {
		code: MatchCode | null;
		state: 'loading' | 'done' | 'missing' | 'signed-out' | 'error';
		fetched: Match | null;
	};
	let result = $state<Result>({ code: null, state: 'loading', fetched: null });
	// When the read failed: was it the connection, or a problem on our side?
	let offline = $state(false);
	let throttled = $state(false);
	const mine = $derived(result.code === code);
	const lookup = $derived(mine ? result.state : 'loading');

	// The cached copy shows at once, when the player came from a list or just recorded the match.
	// A 404 or a 401 hides it, because the API says it is not theirs or not there, or they are out.
	const match = $derived(
		code && lookup !== 'missing' && lookup !== 'signed-out'
			? (matchCache.get(code) ?? (mine ? result.fetched : null) ?? undefined)
			: undefined
	);
	const title = $derived(code ? `Match ${code} · OPEN Pickleball` : 'Match · OPEN Pickleball');

	// Counts reads and actions. A read that finishes after a newer one started, or after the player
	// confirmed or disputed, is ignored, so it can't bring back an older state.
	let run = 0;
	onDestroy(() => run++);

	/** Keep a match the API returned, in the cache and on the page. */
	function adopt(found: Match) {
		matchCache.remember(found);
		if (result.code === found.code) result.fetched = found;
	}

	async function load() {
		if (!code) return;
		const token = ++run;
		const shown = match?.status;
		result = { code, state: 'loading', fetched: null };
		try {
			const found = await getMatch(code, { remember: false });
			if (token !== run) return;
			adopt(found);
			result = { code, state: 'done', fetched: found };
			if (shown && found.status !== shown) {
				toast('This match changed. Here is where it stands.');
				// The button that had focus may be gone now.
				await tick();
				if (!document.activeElement || document.activeElement === document.body) {
					document.getElementById('status-heading')?.focus();
				}
			}
		} catch (cause) {
			if (token !== run) return;
			if (isAppError(cause) && cause.kind === 'not_found') {
				matchCache.forget(code);
				result = { code, state: 'missing', fetched: null };
			} else if (isAppError(cause) && cause.kind === 'unauthenticated') {
				result = { code, state: 'signed-out', fetched: null };
			} else {
				offline = isAppError(cause) && cause.kind === 'network';
				throttled = isAppError(cause) && cause.kind === 'throttled';
				result = { code, state: 'error', fetched: result.fetched };
			}
		}
	}

	$effect(() => {
		// Rerun when the address or the signed-in player changes.
		void [code, myCode.code];
		if (myCode.status === 'ready' && code) untrack(() => void load());
	});

	let busy = $state<MatchAction | null>(null);
	let error = $state<string | null>(null);
	let disputeOpen = $state(false);

	function problem(cause: unknown, action: MatchAction): string {
		if (isAppError(cause)) {
			if (cause.kind === 'conflict') {
				return "This match can't be changed any more. Check where it stands, then try again.";
			}
			if (cause.kind === 'not_found' || cause.kind === 'forbidden') {
				return 'You can only confirm or dispute a match you played in.';
			}
			return cause.message;
		}
		return action === 'confirm'
			? "We couldn't confirm the score. Try again."
			: "We couldn't dispute the score. Try again.";
	}

	// Settles once the dispute dialog is gone. While it is open it traps focus, and it hands focus
	// back (the dialog's onCloseAutoFocus) after it unmounts, so the page waits for that, not a timer.
	let dialogGone: Promise<void> = Promise.resolve();
	let dialogDone: () => void = () => {};

	function openDispute() {
		dialogGone = new Promise((done) => (dialogDone = done));
		disputeOpen = true;
	}

	/** Move focus to an element once the buttons are enabled again and the dispute dialog is gone. */
	async function focusAfterDialog(id: string) {
		await tick();
		await dialogGone;
		document.getElementById(id)?.focus();
	}

	/**
	 * The API said the match can't take this action, so the page is out of date. Read the match
	 * again and show where it stands. Returns false when that did not work.
	 */
	async function refresh(): Promise<boolean> {
		if (!code) return false;
		try {
			// What the page shows now. The fresh read replaces it in the cache.
			const shown = match?.status;
			run++;
			const found = await getMatch(code, { remember: false });
			adopt(found);
			if (found.status !== shown) toast('This match changed. Here is where it stands.');
			return true;
		} catch {
			return false;
		}
	}

	async function act(action: MatchAction) {
		if (!code || busy) return;
		busy = action;
		error = null;
		// A first read still out must not overwrite what this action gets.
		run++;
		if (result.code === code && result.state === 'loading') result.state = 'done';
		// Where focus goes once the buttons are enabled again. A disabled button can't take focus.
		let focusId = 'status-heading';
		try {
			if (action === 'confirm') {
				const updated = await confirmMatch(code);
				adopt(updated);
				toast(
					updated.status === 'confirmed'
						? 'Confirmed. The match now counts.'
						: 'Confirmed. Thanks for checking the score.'
				);
			} else {
				adopt(await disputeMatch(code));
				toast('Score disputed');
			}
		} catch (cause) {
			if (!(isAppError(cause) && cause.kind === 'conflict' && (await refresh()))) {
				error = problem(cause, action);
				// The button the player pressed is still here, so put focus back on it.
				focusId = action === 'dispute' ? 'dispute-button' : 'confirm-button';
			}
		} finally {
			busy = null;
		}
		if (focusId) await focusAfterDialog(focusId);
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if match && myCode.code}
	{@const you = myCode.code}
	<a
		href={resolve(ROUTES.matches)}
		class="mt-2 inline-flex items-center gap-2.5 text-base text-muted underline underline-offset-4 hover:text-secondary"
		><ArrowLeftIcon class="size-4" aria-hidden="true" />Matches</a
	>
	{#if lookup === 'error'}
		<div
			class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-muted"
			role="status"
		>
			<span>Showing a saved copy.</span>
			<Button variant="outline" size="sm" onclick={load}>Try again</Button>
		</div>
	{/if}
	<div class="pt-4">
		<p class="label">{formatName(match.format)} · {formatLongDate(match.playedOn)}</p>
		<h1 class="page-title mt-2">{matchHeadline(match, you)}</h1>
		<p class="mt-2 text-xl font-semibold tabular-nums">{scoreLine(match, viewpoint(match))}</p>
		<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
			<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
			<span class="font-display text-sm text-muted"
				><span class="sr-only">Match code </span>{match.code}</span
			>
		</div>
	</div>

	{#snippet score()}
		<Scoreboard {match} {you} />
	{/snippet}
	{#snippet status()}
		<StatusPanel {match} {busy} {error} onconfirm={() => act('confirm')} ondispute={openDispute} />
	{/snippet}

	<!-- When the player has something to do, the buttons come before the scoreboard. -->
	{#if needsViewerConfirmation(match)}
		{@render status()}
		{@render score()}
	{:else}
		{@render score()}
		{@render status()}
	{/if}

	<dl class="mt-8 grid grid-cols-2 gap-x-6">
		<div>
			<dt class="text-sm text-muted">Games to</dt>
			<dd class="mt-0.5">{match.gameTarget}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted">Scoring</dt>
			<dd class="mt-0.5">{scoringName(match.scoringType)}</dd>
		</div>
	</dl>

	<DisputeDialog
		bind:open={disputeOpen}
		onconfirm={() => act('dispute')}
		onclosed={() => dialogDone()}
	/>
{:else if code && (lookup === 'loading' || lookup === 'done')}
	<h1 class="page-title">Match</h1>
	<CodeGate>
		<LoadingState label="Loading the match…" variant="detail" class="mt-8" />
	</CodeGate>
{:else if code && lookup === 'signed-out'}
	<h1 class="page-title">Match</h1>
	<section class="mt-8 grid justify-items-start gap-3">
		<p class="max-w-md text-muted">Sign in to see your matches.</p>
		<Button href={resolve(ROUTES.login)}>Sign in</Button>
	</section>
{:else if code && lookup === 'error'}
	<h1 class="page-title">Match</h1>
	<div class="mt-8">
		<Notice kind={offline ? 'offline' : 'error'} title="This match didn't load." onretry={load}>
			{#if offline}
				It needs a connection. Check it, then try again.
			{:else if throttled}
				Too many requests in a short time. Wait a minute, then try again.
			{:else}
				Something went wrong on our side. Wait a moment, then try again.
			{/if}
		</Notice>
	</div>
{:else}
	<Empty class="mt-4">
		<EmptyHeader>
			<EmptyMedia>
				<span class="mark size-10 text-line" aria-hidden="true"></span>
			</EmptyMedia>
			<EmptyTitle level="h1">We couldn't find this match</EmptyTitle>
			<EmptyDescription>
				<p>
					Only the players in a match can see it. Check the link, or look for the match in your
					history.
				</p>
			</EmptyDescription>
		</EmptyHeader>
		<EmptyContent>
			<Button href={resolve(ROUTES.matches)} variant="outline">Back to your matches</Button>
		</EmptyContent>
	</Empty>
{/if}
