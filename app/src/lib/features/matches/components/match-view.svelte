<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import { isAppError } from '#lib/api/index.js';
	import { parseMatchCode } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { matchCache, type MatchAction } from '../cache.svelte.js';
	import {
		STATUS_LABELS,
		formatDate,
		formatLongDate,
		formatName,
		matchTitle,
		scoringName
	} from '../format.js';
	import { confirmMatch, disputeMatch, findMatch } from '../services.js';
	import CodeGate from './code-gate.svelte';
	import DisputeDialog from './dispute-dialog.svelte';
	import Notice from './notice.svelte';
	import Scoreboard from './scoreboard.svelte';
	import StatusPanel from './status-panel.svelte';

	/** The match code from the address, as typed. */
	let { code: raw }: { code: string } = $props();

	const parsed = $derived(parseMatchCode(raw));
	const code = $derived(parsed.ok ? parsed.value : null);
	const match = $derived(code ? matchCache.get(code) : undefined);
	const title = $derived(code ? `Match ${code} · OPEN Pickleball` : 'Match · OPEN Pickleball');
	const acted = $derived(code ? matchCache.actedOn(code) : undefined);

	// Looking the match up. The cache answers when the player came from a list. A deep link has to
	// scan their list, because there is no `GET matches/{code}` (backend#194).
	let lookup = $state<'loading' | 'done' | 'error'>('loading');
	let run = 0;
	onDestroy(() => run++);

	async function find() {
		const you = myCode.code;
		if (!code || !you) return;
		const mine = ++run;
		lookup = 'loading';
		try {
			await findMatch(code, you);
			if (mine === run) lookup = 'done';
		} catch {
			if (mine === run) lookup = 'error';
		}
	}

	$effect(() => {
		// Rerun when the address or the signed-in player changes.
		void [code, myCode.code];
		if (myCode.status === 'ready' && code) untrack(() => void find());
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

	/** Move focus to an element once the dispute dialog is gone, because the dialog traps focus. */
	async function focusAfterDialog(id: string) {
		await tick();
		// A dialog that is closing still traps focus, so wait until it is gone (about a second at most).
		for (let frame = 0; frame < 60 && document.querySelector('[role="alertdialog"]'); frame++) {
			await new Promise((done) => requestAnimationFrame(() => done(null)));
		}
		document.getElementById(id)?.focus();
	}

	/**
	 * The API said the match can't take this action, so the page is out of date. Read the match
	 * again, skipping the cache, and show where it stands. Returns false when that did not work.
	 */
	async function refresh(): Promise<boolean> {
		const you = myCode.code;
		if (!code || !you) return false;
		try {
			const found = await findMatch(code, you, { fresh: true });
			if (!found) return false;
			toast('This match changed. Here is where it stands.');
			return true;
		} catch {
			return false;
		}
	}

	async function act(action: MatchAction) {
		if (!code || busy) return;
		busy = action;
		error = null;
		// Where focus goes once the buttons are enabled again. A disabled button can't take focus.
		let focusId = 'status-heading';
		try {
			if (action === 'confirm') {
				const updated = await confirmMatch(code);
				toast(
					updated.status === 'confirmed'
						? 'Confirmed. The match now counts.'
						: 'Confirmed. Thanks for checking the score.'
				);
			} else {
				await disputeMatch(code);
				toast('Score disputed');
			}
		} catch (cause) {
			if (!(isAppError(cause) && cause.kind === 'conflict' && (await refresh()))) {
				error = problem(cause, action);
				// The dialog closed on Dispute and the button is still here, so put focus back on it.
				focusId = action === 'dispute' ? 'dispute-button' : '';
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
		href={resolve('/matches')}
		class="mt-2 inline-flex items-center gap-2.5 text-[15px] text-muted underline underline-offset-4 hover:text-secondary"
		><ArrowLeftIcon class="size-4" aria-hidden="true" />Matches</a
	>
	<div class="pt-4">
		<p class="label">{formatLongDate(match.playedOn)}</p>
		<h1 class="page-title mt-2">{matchTitle(match)}</h1>
		<div class="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-3">
			<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
			<span class="font-display text-xs text-faint"
				><span class="sr-only">Match code </span>{match.code}</span
			>
		</div>
	</div>

	<Scoreboard {match} {you} />

	<StatusPanel
		{match}
		{you}
		{acted}
		{busy}
		{error}
		onconfirm={() => act('confirm')}
		ondispute={() => (disputeOpen = true)}
	/>

	<dl class="mt-7 grid grid-cols-2 gap-x-6 gap-y-[18px] sm:grid-cols-4">
		<div>
			<dt class="text-[13px] text-faint">Played</dt>
			<dd class="mt-0.5">{formatDate(match.playedOn)}</dd>
		</div>
		<div>
			<dt class="text-[13px] text-faint">Format</dt>
			<dd class="mt-0.5">{formatName(match.format)}</dd>
		</div>
		<div>
			<dt class="text-[13px] text-faint">Games to</dt>
			<dd class="mt-0.5">{match.gameTarget}</dd>
		</div>
		<div>
			<dt class="text-[13px] text-faint">Scoring</dt>
			<dd class="mt-0.5">{scoringName(match.scoringType)}</dd>
		</div>
	</dl>

	<DisputeDialog bind:open={disputeOpen} onconfirm={() => act('dispute')} />
{:else if myCode.status !== 'ready' || (code && lookup === 'loading')}
	<h1 class="page-title">Match</h1>
	<CodeGate>
		<p class="mt-8 text-muted" role="status">Loading the match…</p>
	</CodeGate>
{:else if code && lookup === 'error'}
	<h1 class="page-title">Match</h1>
	<div class="mt-8">
		<Notice kind="error" title="This match didn't load." onretry={find}>
			OPEN didn't respond. Check your connection, then try again.
		</Notice>
	</div>
{:else}
	<h1 class="page-title">We couldn't find this match</h1>
	<div class="mt-4 grid max-w-[46ch] justify-items-start gap-5">
		<p class="text-muted">
			It may not be one of yours, the link may be wrong, or it's older than your last 100 matches.
			Matches you played in are in your history.
		</p>
		<Button href={resolve('/matches')} variant="outline">Matches</Button>
	</div>
{/if}
