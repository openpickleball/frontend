<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { resolve } from '$app/paths';
	import { isAppError } from '#lib/api/index.js';
	import { ROUTES, parseMatchCode, type Match, type MatchCode } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '#lib/ui/empty/index.js';
	import { actionProblem } from '../action-problem.js';
	import { matchCache, type HoldState, type MatchAction } from '../cache.svelte.js';
	import {
		STATUS_LABELS,
		formatDayMonth,
		formatName,
		formatShortDate,
		scoringName
	} from '../format.js';
	import {
		confirmMatch,
		disputeMatch,
		findHold,
		getMatch,
		vouchForMatch,
		withdrawDispute
	} from '../services.js';
	import { panelIsQuiet } from '../status.js';
	import CodeGate from './code-gate.svelte';
	import DisputeDialog from './dispute-dialog.svelte';
	import Scoreboard from './scoreboard.svelte';
	import StatusPanel from './status-panel.svelte';
	import VouchDialog from './vouch-dialog.svelte';
	import WithdrawDialog from './withdraw-dialog.svelte';

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
	// `MatchOut` has no hold field, so the holds list says whether the match is held. The cache
	// keeps what the home list or this page's own lookup found.
	const hold = $derived(match && code ? matchCache.holdOf(code) : undefined);
	// "Doubles, 14 Nov". The match code is in Details, not in the tab.
	const title = $derived(
		match
			? `${formatName(match.format)}, ${formatDayMonth(match.playedOn)} · OPEN Pickleball`
			: 'Match · OPEN Pickleball'
	);

	// Counts reads and actions. A read that finishes after a newer one started, or after the player
	// confirmed or disputed, is ignored, so it can't bring back an older state.
	let run = 0;
	onDestroy(() => run++);

	/** Keep a match the API returned, in the cache and on the page. */
	function adopt(found: Match) {
		matchCache.remember(found);
		if (result.code === found.code) result.fetched = found;
	}

	/** The status heading, or the page title when a confirmed match shows no status panel. */
	function statusTarget(): HTMLElement | null {
		return document.getElementById('status-heading') ?? document.getElementById('match-title');
	}

	/** Move focus to the status heading, but only when the page lost it (it was on a control that is gone). */
	function rescueFocus() {
		if (!document.activeElement || document.activeElement === document.body) {
			statusTarget()?.focus();
		}
	}

	/** Did the read change what the player sees or can do? */
	function changed(
		before: Match,
		after: Match,
		holdBefore: HoldState | undefined,
		holdAfter: HoldState | undefined
	): boolean {
		return (
			before.status !== after.status ||
			// A hold the page did not know of before is not a change the player saw.
			(holdBefore !== undefined && holdBefore.vouched !== holdAfter?.vouched) ||
			before.viewerDecision !== after.viewerDecision ||
			JSON.stringify(before.confirmedBySide) !== JSON.stringify(after.confirmedBySide)
		);
	}

	// True while Try again on the saved-copy line is running, so the line stays and focus stays on it.
	let retrying = $state(false);
	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			await load();
		} finally {
			retrying = false;
		}
	}

	/**
	 * Read the match and whether it is held, side by side. The holds list also has the event
	 * matches a member of the event's organizer may vouch for, which `GET matches/{code}` gives
	 * players only, so a 404 shows the match from the holds list when it is there. Whether it is
	 * held stays unknown when only the holds list fails. Throws what the match read threw.
	 */
	async function read(code: MatchCode): Promise<Match> {
		const [matchRead, holdRead] = await Promise.allSettled([
			getMatch(code, { remember: false }),
			findHold(code)
		]);
		if (matchRead.status === 'fulfilled') return matchRead.value;
		const notFound = isAppError(matchRead.reason) && matchRead.reason.kind === 'not_found';
		if (notFound && holdRead.status === 'fulfilled' && holdRead.value) return holdRead.value.match;
		throw matchRead.reason;
	}

	async function load() {
		if (!code) return;
		const token = ++run;
		const shown = match;
		const holdShown = hold;
		result = { code, state: 'loading', fetched: null };
		try {
			const found = await read(code);
			if (token !== run) return;
			adopt(found);
			result = { code, state: 'done', fetched: found };
			// The saved-copy line goes with the retry, so focus has to move on after this.
			retrying = false;
			if (shown) {
				if (changed(shown, found, holdShown, matchCache.holdOf(code))) {
					toast('This match changed. Here is where it stands.');
				}
				// The control that had focus may be gone now, even when the status did not change.
				await tick();
				// The player may have left, or acted, while the page updated.
				if (token === run) rescueFocus();
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

	// The record page hands the match over, and this page says once that the player just recorded it.
	// The correction page does the same for a correction.
	let justRecorded = $state(false);
	let justCorrected = $state(false);
	$effect(() => {
		const current = code;
		untrack(() => {
			justRecorded = current ? matchCache.takeRecorded(current) : false;
			justCorrected = current ? matchCache.takeCorrected(current) : false;
		});
	});
	// The correction the player saved in place of this match, in this visit.
	const replacedBy = $derived(code ? matchCache.replacementOf(code) : undefined);

	async function copyCode(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast('Match code copied');
		} catch {
			toast("Couldn't copy. Select the code and copy it by hand.");
		}
	}

	let busy = $state<MatchAction | null>(null);
	let error = $state<string | null>(null);
	let disputeOpen = $state(false);
	let withdrawOpen = $state(false);
	let vouchOpen = $state(false);

	// Settles once the open dialog is gone. While it is open it traps focus, and it hands focus
	// back (the dialog's onCloseAutoFocus) after it unmounts, so the page waits for that, not a timer.
	let dialogGone: Promise<void> = Promise.resolve();
	let dialogDone: () => void = () => {};

	function openDialog(which: 'dispute' | 'withdraw' | 'vouch') {
		dialogGone = new Promise((done) => (dialogDone = done));
		if (which === 'dispute') disputeOpen = true;
		else if (which === 'withdraw') withdrawOpen = true;
		else vouchOpen = true;
	}

	/** Move focus to an element once the buttons are enabled again and the open dialog is gone. */
	async function focusAfterDialog(id: string) {
		await tick();
		await dialogGone;
		// The button may be gone after a fresh read, so the status heading takes focus then.
		(document.getElementById(id) ?? statusTarget())?.focus();
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
			const heldBefore = hold !== undefined;
			run++;
			const found = await read(code);
			adopt(found);
			if (found.status !== shown || heldBefore !== (matchCache.holdOf(code) !== undefined)) {
				toast('This match changed. Here is where it stands.');
			}
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
		// Where focus goes once the buttons are enabled again. A button that is aria-disabled keeps focus, so this does not move it a second time.
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
			} else if (action === 'dispute') {
				adopt(await disputeMatch(code));
				toast('Score disputed');
			} else if (action === 'vouch') {
				const updated = await vouchForMatch(code);
				adopt(updated);
				// The answer doesn't say whether the hold ended, so read the holds list.
				let ended: boolean | null = null;
				try {
					ended = (await findHold(code)) === null;
				} catch {
					// The vouch went through. The page shows the vouch and checks again next time.
				}
				toast(
					ended === null
						? 'Vouched for this match.'
						: !ended
							? 'Vouched. The hold ends once the others vouch too.'
							: updated.status === 'confirmed'
								? 'Vouched. The hold has ended and the match now counts.'
								: 'Vouched. The hold has ended.'
				);
			} else {
				const updated = await withdrawDispute(code);
				adopt(updated);
				toast(
					updated.status === 'disputed'
						? 'Dispute withdrawn. Another player still disputes this score.'
						: updated.status === 'confirmed'
							? 'Dispute withdrawn. The match counts again.'
							: 'Dispute withdrawn.'
				);
			}
		} catch (cause) {
			const conflict = isAppError(cause) && cause.kind === 'conflict';
			const refreshed = conflict && (await refresh());
			if (!refreshed) {
				error = actionProblem(cause, action);
				// The button the player pressed is still here, so put focus back on it.
				focusId = `${action}-button`;
			} else if (action === 'withdraw' || action === 'vouch') {
				// The page now shows where the match stands. Say why the action did nothing.
				error = actionProblem(cause, action);
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
	<Button
		variant="link"
		href={resolve(ROUTES.matches)}
		class="mt-2 min-h-10 px-0 text-base font-normal text-muted"
	>
		<ArrowLeftIcon class="size-4" aria-hidden="true" />Matches
	</Button>
	{#if lookup === 'error' || retrying}
		<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-muted">
			<span role="status">Showing a saved copy.</span>
			<Button variant="outline" size="sm" onclick={retry} aria-disabled={retrying || undefined}>
				{retrying ? 'Trying…' : 'Try again'}
			</Button>
		</div>
	{/if}
	<!-- The header is the title and the badges. The scoreboard below says who played and the score. -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
		<h1 id="match-title" tabindex="-1" class="page-title outline-none">
			{formatName(match.format)} · {formatShortDate(match.playedOn)}
		</h1>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
			{#if hold && match.status !== 'voided'}
				<Badge>On hold</Badge>
			{/if}
		</div>
	</div>

	<!-- The status panel always comes first, so it is in the same place for every state and viewer.
	     A confirmed match with nothing else to say drops it, and the badge says where it stands. -->
	{#if !panelIsQuiet(match, hold) || justRecorded || justCorrected || error}
		<StatusPanel
			{match}
			{hold}
			{busy}
			{error}
			recorded={justRecorded}
			corrected={justCorrected}
			correctHref={resolve('/matches/[code]/correct', { code: match.code })}
			replacedByHref={replacedBy ? resolve('/matches/[code]', { code: replacedBy }) : undefined}
			onconfirm={() => act('confirm')}
			ondispute={() => openDialog('dispute')}
			onwithdraw={() => openDialog('withdraw')}
			onvouch={() => openDialog('vouch')}
		/>
	{/if}
	<Scoreboard {match} {you} />

	<Section title="Details">
		<dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
			<div>
				<dt class="text-sm text-muted">Games to</dt>
				<dd class="mt-0.5">{match.gameTarget}</dd>
			</div>
			<div>
				<dt class="text-sm text-muted">Scoring</dt>
				<dd class="mt-0.5">{scoringName(match.scoringType)}</dd>
			</div>
			<!-- Names only: players have no Event or Club page, and the organizer is never named. -->
			{#if match.event}
				<div>
					<dt class="text-sm text-muted">Event</dt>
					<dd class="mt-0.5">{match.event.name}</dd>
				</div>
			{/if}
			{#if match.club}
				<div>
					<dt class="text-sm text-muted">Club</dt>
					<dd class="mt-0.5">{match.club.name}</dd>
				</div>
			{/if}
			<!-- The address uses the code, a correction gets a new one, and organizers ask for it. -->
			<div class="col-span-2 lg:col-span-1">
				<dt class="text-sm text-muted">Match code</dt>
				<dd class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="open-code">{match.code}</span>
					<Button variant="outline" size="sm" onclick={() => copyCode(match.code)}>
						<CopyIcon aria-hidden="true" />
						Copy <span class="sr-only">match code</span>
					</Button>
				</dd>
			</div>
		</dl>
	</Section>

	<DisputeDialog
		bind:open={disputeOpen}
		onconfirm={() => act('dispute')}
		onclosed={() => dialogDone()}
	/>
	<WithdrawDialog
		bind:open={withdrawOpen}
		onconfirm={() => act('withdraw')}
		onclosed={() => dialogDone()}
	/>
	<VouchDialog bind:open={vouchOpen} onconfirm={() => act('vouch')} onclosed={() => dialogDone()} />
{:else if code && (lookup === 'loading' || lookup === 'done')}
	<h1 class="page-title">Match</h1>
	<CodeGate>
		<LoadingState label="Loading the match…" variant="detail" class="mt-8" />
	</CodeGate>
{:else if code && lookup === 'signed-out'}
	<h1 class="page-title">Match</h1>
	<section class="mt-8 grid justify-items-start gap-3">
		<p class="max-w-md text-muted">Sign in to see your matches.</p>
		<!-- Sign-in returns to this match. The code was checked above, so the path is safe. -->
		<Button
			href={`${resolve(ROUTES.login)}?next=${encodeURIComponent(resolve('/matches/[code]', { code }))}`}
		>
			Sign in
		</Button>
	</section>
{:else if code && lookup === 'error'}
	<h1 class="page-title">Match</h1>
	<div class="mt-8">
		<Alert variant={offline ? 'default' : 'destructive'}>
			{#if offline}
				<WifiOffIcon aria-hidden="true" />
			{:else}
				<CircleAlertIcon aria-hidden="true" />
			{/if}
			<AlertTitle>This match didn't load.</AlertTitle>
			<AlertDescription>
				{#if offline}
					It needs a connection. Check it, then try again.
				{:else if throttled}
					Too many requests in a short time. Wait a minute, then try again.
				{:else}
					Something went wrong on our side. Wait a moment, then try again.
				{/if}
			</AlertDescription>
			<AlertAction>
				<Button variant="outline" size="sm" onclick={load}>Try again</Button>
			</AlertAction>
		</Alert>
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
