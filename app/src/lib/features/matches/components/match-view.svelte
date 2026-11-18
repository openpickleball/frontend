<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
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
				return "This match can't be changed any more. Reload the page to see where it stands.";
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

	/** After the buttons go away, put focus on the new status so it is read out. */
	async function focusStatus() {
		await tick();
		// A dialog that is closing still traps focus, so wait until it is gone (about a second at most).
		for (let frame = 0; frame < 60 && document.querySelector('[role="alertdialog"]'); frame++) {
			await new Promise((done) => requestAnimationFrame(() => done(null)));
		}
		document.getElementById('status-heading')?.focus();
	}

	async function act(action: MatchAction) {
		if (!code || busy) return;
		busy = action;
		error = null;
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
			await focusStatus();
		} catch (cause) {
			error = problem(cause, action);
		} finally {
			busy = null;
		}
	}
</script>

{#if match && myCode.code}
	{@const you = myCode.code}
	<a
		href={resolve('/matches')}
		class="mt-2 inline-block text-[15px] text-muted underline underline-offset-4 hover:text-secondary"
		>Matches</a
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
			It may not be one of yours, or the link may be wrong. Matches you played in are in your
			history.
		</p>
		<Button href={resolve('/matches')} variant="outline">Matches</Button>
	</div>
{/if}
