<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { isAppError } from '#lib/api/index.js';
	import { ROUTES, parseMatchCode, type Match, type PlayerCode } from '#lib/domain/index.js';
	import {
		RecordMatchForm,
		correctionDraft,
		type SubmitResult,
		type submitMatch
	} from '#lib/features/record-match/index.js';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { formatLongDate, formatName, matchHeadline } from '../format.js';
	import { getMatch, rememberCorrection } from '../services.js';
	import {
		CORRECT_CLUB_DISPUTE,
		CORRECT_CLUB_NOTE,
		CORRECT_EVENT_NOTE,
		canCorrect,
		matchStatusCopy
	} from '../status.js';
	import CodeGate from './code-gate.svelte';

	let {
		code: raw,
		submit
	}: {
		/** The match code from the address, as typed. */
		code: string;
		/** The service that sends the correction. Tests pass a stand-in. */
		submit?: typeof submitMatch;
	} = $props();

	const parsed = $derived(parseMatchCode(raw));
	const code = $derived(parsed.ok ? parsed.value : null);

	// The match as the API has it now. The form starts from it, so it is always read fresh: a
	// cached copy may be out of date, and a match that was confirmed meanwhile can't be corrected.
	type State =
		{ kind: 'loading' } | { kind: 'done'; match: Match } | { kind: 'missing' } | { kind: 'error' };
	let view = $state<State>({ kind: 'loading' });
	let run = 0;

	async function load() {
		const current = code;
		if (!current) {
			view = { kind: 'missing' };
			return;
		}
		const token = ++run;
		view = { kind: 'loading' };
		try {
			const match = await getMatch(current);
			if (token === run) view = { kind: 'done', match };
		} catch (cause) {
			if (token !== run) return;
			view =
				isAppError(cause) && cause.kind === 'not_found' ? { kind: 'missing' } : { kind: 'error' };
		}
	}

	$effect(() => {
		void code;
		untrack(() => void load());
	});

	async function corrected(result: SubmitResult) {
		if (!code) return;
		toast('Correction saved');
		// The old match is voided. Its page links to the correction for the rest of this visit.
		rememberCorrection(result.match, code);
		await goto(resolve('/matches/[code]', { code: result.match.code }));
	}

	/** Why the app can't offer a correction for this match, or null when it can. */
	function blocked(match: Match): string | null {
		if (match.status === 'confirmed') {
			return "This match is confirmed, so it can't be corrected.";
		}
		if (match.status === 'voided') return 'This match was voided, so there is nothing to correct.';
		// The backend answers 404 for a match with an Event or a Club. Checked before the private
		// player, since `canCorrect` refuses these too and that reason would be false here.
		if (match.event) return CORRECT_EVENT_NOTE;
		// The dispute advice only when the status panel offers this player Dispute, by its own rule.
		if (match.club) {
			return matchStatusCopy(match).actions.includes('dispute')
				? `${CORRECT_CLUB_NOTE} ${CORRECT_CLUB_DISPUTE}`
				: CORRECT_CLUB_NOTE;
		}
		if (!canCorrect(match)) {
			return "A player in this match has a private account, so the app can't name them in a correction. If the score is wrong, dispute the match instead.";
		}
		return null;
	}
</script>

<svelte:head>
	<title
		>{code ? `Correct match ${code} · OPEN Pickleball` : 'Correct a match · OPEN Pickleball'}</title
	>
</svelte:head>

{#if code}
	<Button
		variant="link"
		href={resolve('/matches/[code]', { code })}
		class="mt-2 min-h-10 px-0 text-base font-normal text-muted"
	>
		<ArrowLeftIcon class="size-4" aria-hidden="true" />Back to the match
	</Button>
{/if}

<div class="pt-4">
	<h1 class="page-title">Correct the score</h1>
</div>

<CodeGate>
	{#snippet children(own: PlayerCode)}
		{#if view.kind === 'loading'}
			<LoadingState label="Loading the match…" variant="detail" class="mt-8" />
		{:else if view.kind === 'missing'}
			<section class="mt-8 grid justify-items-start gap-4">
				<p class="max-w-md text-muted">
					We couldn't find this match. Only the players in a match can see it or correct it.
				</p>
				<Button href={resolve(ROUTES.matches)} variant="outline">Back to your matches</Button>
			</section>
		{:else if view.kind === 'error'}
			<div class="mt-8">
				<Alert variant="destructive">
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>This match didn't load.</AlertTitle>
					<AlertDescription>Check your connection, then try again.</AlertDescription>
					<AlertAction>
						<Button variant="outline" size="sm" onclick={load}>Try again</Button>
					</AlertAction>
				</Alert>
			</div>
		{:else}
			{@const match = view.match}
			{@const reason = blocked(match)}
			{@const draft = reason === null ? correctionDraft(match, own) : null}
			<p class="label mt-4">{formatName(match.format)} · {formatLongDate(match.playedOn)}</p>
			<p class="mt-2 text-lg font-semibold">{matchHeadline(match, own)}</p>
			{#if draft && code}
				<p class="mt-4 max-w-md text-muted">
					Fix the date, the scoring or the games. Once it's saved, the other team can confirm the
					corrected match or dispute it.
				</p>
				<div class="max-w-2xl">
					{#key `${own}|${match.code}`}
						<RecordMatchForm {own} correcting={{ code, draft }} onrecorded={corrected} {submit} />
					{/key}
				</div>
			{:else}
				<section class="mt-8 grid justify-items-start gap-4" data-testid="cannot-correct">
					<p class="max-w-md text-muted">{reason ?? "This match can't be corrected."}</p>
					<Button href={resolve('/matches/[code]', { code: match.code })} variant="outline">
						See the match
					</Button>
				</section>
			{/if}
		{/if}
	{/snippet}
</CodeGate>
