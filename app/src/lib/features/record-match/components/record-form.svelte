<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ROUTES,
		SCORE_INPUT_MAX_LENGTH,
		todayLocal,
		type GameTarget,
		type MatchFormat,
		type PlayerCode,
		type ScoringType
	} from '#lib/domain/index.js';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { FieldError, FieldLegend, FieldSet, fieldA11y } from '#lib/ui/field/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import { Label } from '#lib/ui/label/index.js';
	import { createDraftStore, isBlank, type DraftStore } from '../draft.js';
	import { RecordForm } from '../form.svelte.js';
	import { searchPlayers, type SearchFn } from '../search.js';
	import { submitMatch, type SubmitResult } from '../service.js';
	import PlayerSlot from './player-slot.svelte';
	import Segmented from './segmented.svelte';

	let {
		own,
		onrecorded,
		onchangecode,
		submit = submitMatch,
		search = searchPlayers,
		drafts = createDraftStore()
	}: {
		/** The signed-in player's own OPEN code. */
		own: PlayerCode;
		/** Called once the match is saved. `result.confirmError` is set if the confirmation failed. */
		onrecorded: (result: SubmitResult) => void;
		/**
		 * Lets the player replace the OPEN code saved on this device. The page supplies it, because
		 * this feature does not import players. Without it, the refusal notice has no button.
		 */
		onchangecode?: () => void;
		/** The service that sends the match. Tests pass a stand-in. */
		submit?: typeof submitMatch;
		/** The name search. Tests pass a stand-in. */
		search?: SearchFn;
		/** Where the draft is kept between visits. Tests pass a stand-in. */
		drafts?: DraftStore;
	} = $props();

	// The form belongs to one player. The page remounts this if their code changes.
	// svelte-ignore state_referenced_locally
	const form = new RecordForm(own);

	// Put back what this player had entered before a reload or a stray tap, and keep it current.
	// svelte-ignore state_referenced_locally
	const kept = drafts.read(own);
	if (kept) form.restore(kept);

	$effect(() => {
		const draft = form.draft;
		if (isBlank(draft, todayLocal())) drafts.clear(own);
		else drafts.write(own, draft);
	});

	let summaryBox = $state<HTMLDivElement | null>(null);
	let failureBox = $state<HTMLDivElement | null>(null);

	const errors = $derived(form.errors);
	const summary = $derived(form.submitted ? form.summary : []);
	// Read again on focus and on submit, so a form left open past midnight does not allow tomorrow.
	let maxDate = $state(todayLocal());

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		// The button is aria-disabled while sending, so Enter in a field can still land here.
		if (form.sending) return;
		maxDate = todayLocal();
		const result = await form.send(submit);
		if (result) {
			// The match is saved, so the draft is done.
			drafts.clear(own);
			onrecorded(result);
			return;
		}
		await tick();
		// Field errors take focus first. Otherwise it is the offline or duplicate notice.
		(summaryBox ?? failureBox)?.focus();
	}

	function focusField(event: MouseEvent, id: string) {
		event.preventDefault();
		document.getElementById(id)?.focus();
	}

	/** Show a game's errors once focus has left its whole row, not on the way from one score to the next. */
	function leaveRow(event: FocusEvent, index: number) {
		const row = event.currentTarget as HTMLElement;
		if (row.contains(event.relatedTarget as Node | null)) return;
		// A row left empty says nothing until the player submits. Otherwise the message would push
		// the "Add a game" button away as it is pressed.
		const game = form.games[index];
		if (game && (game.a.trim() !== '' || game.b.trim() !== '')) form.touch(`games.${index}`);
	}

	async function addGame() {
		if (!form.addGame()) return;
		await tick();
		document.getElementById(`game-${form.games.length - 1}-a`)?.focus();
	}

	/** Keep focus in the games: the row now in this place, else the one before, else the add button. */
	async function removeGame(index: number) {
		form.removeGame(index);
		await tick();
		const target =
			document.getElementById(`game-${index}-a`) ??
			document.getElementById(`game-${index - 1}-a`) ??
			document.getElementById('add-game');
		target?.focus();
	}

	const first = (key: string) => errors[key]?.[0] ?? '';
	const dateA11y = $derived(
		fieldA11y({ id: 'played-on', error: first('played_on'), hint: form.dateHint })
	);
	const gameA11y = (index: number) =>
		fieldA11y({ id: `game-${index}`, error: errors[`games.${index}`]?.[0] ?? '' });
</script>

<form {onsubmit} novalidate class="grid gap-2">
	{#if summary.length > 0}
		<div class="mt-8">
			<!-- Focusable, so a failed submit can move focus here. -->
			<Alert variant="destructive" id="error-summary" bind:ref={summaryBox} tabindex={-1}>
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>
					{summary.length === 1
						? 'Fix 1 thing to record this match'
						: `Fix ${summary.length} things to record this match`}
				</AlertTitle>
				<AlertDescription>
					<ul class="grid gap-1 text-secondary">
						{#each summary as entry (entry.key)}
							<li>
								{#if entry.target}
									{@const target = entry.target}
									<Button
										variant="link"
										size="inline"
										href="#{target}"
										onclick={(event) => focusField(event, target)}>{entry.message}</Button
									>
								{:else}
									{entry.message}
								{/if}
							</li>
						{/each}
					</ul>
				</AlertDescription>
			</Alert>
		</div>
	{/if}

	{#if form.failure}
		<div class="mt-8">
			<Alert variant="destructive" bind:ref={failureBox} tabindex={-1}>
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>
					{form.failure.kind === 'other' ? "We couldn't record this match" : form.failure.message}
				</AlertTitle>
				<AlertDescription class="grid gap-1.5">
					{#if form.failure.kind === 'offline'}
						<p>
							Everything you entered is still here. Check your matches before you try again, so the
							same match is not recorded twice. Then connect to the internet and send it again.
						</p>
					{:else if form.failure.kind === 'duplicate'}
						{#if form.failure.matchCode}
							<p>
								<Button
									variant="link"
									size="inline"
									href={resolve('/matches/[code]', { code: form.failure.matchCode })}
									>See the match</Button
								>
							</p>
							<p>You may still need to confirm it.</p>
						{:else}
							<p>
								Look in <Button variant="link" size="inline" href={resolve(ROUTES.matches)}
									>your matches</Button
								> to find it. You may still need to confirm it.
							</p>
						{/if}
					{:else if form.failure.kind === 'forbidden'}
						<p>Everything you entered is still here.</p>
					{:else}
						<p>{form.failure.message}</p>
					{/if}
				</AlertDescription>
				{#if form.failure.kind === 'forbidden' && onchangecode}
					<AlertAction>
						<Button type="button" variant="outline" size="sm" onclick={onchangecode}>
							Change my code
						</Button>
					</AlertAction>
				{/if}
			</Alert>
		</div>
	{/if}

	<FieldSet class="mt-8 gap-4 border-t border-line pt-3">
		<FieldLegend>Match</FieldLegend>
		<div class="flex flex-wrap items-start gap-x-6 gap-y-4">
			<Segmented
				name="format"
				label="Format"
				options={[
					{ value: 'singles', label: 'Singles' },
					{ value: 'doubles', label: 'Doubles' }
				]}
				bind:value={() => form.format, (v) => (form.format = v as MatchFormat)}
			/>
			<div class="grid gap-2">
				<Label for="played-on">Date played</Label>
				<Input
					id="played-on"
					type="date"
					bind:value={form.playedOn}
					max={maxDate}
					class="w-52"
					onfocus={() => (maxDate = todayLocal())}
					{...dateA11y.attrs}
					onblur={() => form.touch('played_on')}
				/>
				{#if errors.played_on}
					<FieldError id={dateA11y.errorId}>{first('played_on')}</FieldError>
				{:else if form.dateHint}
					<p id={dateA11y.hintId} class="text-base text-muted">{form.dateHint}</p>
				{/if}
			</div>
		</div>
	</FieldSet>

	<FieldSet class="mt-8 gap-4 border-t border-line pt-3">
		<FieldLegend>Players</FieldLegend>
		<p class="max-w-md text-base text-muted">
			Type a player's name to find them, or enter their OPEN code. They can find theirs on their
			Profile page.
		</p>

		<div class="grid gap-3" role="group" aria-labelledby="team-a-title">
			<h2 id="team-a-title" class="text-base font-semibold text-secondary">Your team</h2>
			<PlayerSlot
				id="you"
				label="Your OPEN code"
				code={own}
				locked
				oncommit={() => {}}
				onremove={() => {}}
			/>
			{#if form.doubles}
				<PlayerSlot
					id="partner"
					label="Your partner: name or OPEN code"
					placeholder="Name or P-XXXX-XXXX"
					code={form.partner.code}
					name={form.partner.name}
					exclude={form.taken}
					{search}
					onpick={(hit) => form.choose(form.partner, hit)}
					bind:text={form.partner.text}
					error={first('team_a.1') || first('team_a')}
					oncommit={() => form.commit(form.partner)}
					onremove={() => form.remove(form.partner)}
				/>
			{/if}
		</div>

		<div class="grid gap-3" role="group" aria-labelledby="team-b-title">
			<h2 id="team-b-title" class="text-base font-semibold text-secondary">Opponents</h2>
			{#each form.visibleOpponents as slot, index (index)}
				<PlayerSlot
					id="opponent-{index}"
					label={form.doubles
						? `${index === 0 ? 'First' : 'Second'} opponent: name or OPEN code`
						: 'Your opponent: name or OPEN code'}
					code={slot.code}
					name={slot.name}
					exclude={form.taken}
					{search}
					onpick={(hit) => form.choose(slot, hit)}
					bind:text={slot.text}
					error={first(`team_b.${index}`) || (index === 0 ? first('team_b') : '')}
					oncommit={() => form.commit(slot)}
					onremove={() => form.remove(slot)}
				/>
			{/each}
		</div>
	</FieldSet>

	<FieldSet class="mt-8 gap-4 border-t border-line pt-3">
		<FieldLegend>Scoring</FieldLegend>
		<div class="flex flex-wrap items-start gap-x-6 gap-y-4">
			<Segmented
				name="target"
				label="Games to"
				options={[
					{ value: '11', label: '11' },
					{ value: '15', label: '15' },
					{ value: '21', label: '21' }
				]}
				bind:value={
					() => String(form.gameTarget), (v) => (form.gameTarget = Number(v) as GameTarget)
				}
			/>
			<Segmented
				name="scoring"
				label="Scoring"
				options={[
					{ value: 'side_out', label: 'Side-out' },
					{ value: 'rally', label: 'Rally' }
				]}
				bind:value={() => form.scoringType, (v) => (form.scoringType = v as ScoringType)}
			/>
		</div>
	</FieldSet>

	<FieldSet class="mt-8 gap-4 border-t border-line pt-3">
		<FieldLegend>Games</FieldLegend>
		<div class="grid max-w-sm">
			<div class="flex items-center gap-x-2 pb-2 text-xs text-faint" aria-hidden="true">
				<span class="w-20"></span><span class="w-16 text-center">You</span><span class="w-4"
				></span><span class="w-16 text-center">Opponents</span>
			</div>
			{#each form.games as game, index (index)}
				{@const gameError = errors[`games.${index}`]?.[0] ?? ''}
				{@const a11y = gameA11y(index)}
				<div
					class="grid gap-1.5 border-t border-line py-2.5"
					role="group"
					aria-label="Game {index + 1}"
					onfocusout={(event) => leaveRow(event, index)}
				>
					<div class="flex items-center gap-x-2">
						<span class="w-20 text-base font-semibold text-secondary">Game {index + 1}</span>
						<Input
							id="game-{index}-a"
							bind:value={game.a}
							class="w-16 px-0 text-center text-lg font-semibold tabular-nums"
							inputmode="numeric"
							autocomplete="off"
							maxlength={SCORE_INPUT_MAX_LENGTH}
							aria-label="Game {index + 1}, your team's points"
							{...a11y.attrs}
						/>
						<span class="w-4 text-center text-muted" aria-hidden="true">–</span>
						<Input
							id="game-{index}-b"
							bind:value={game.b}
							class="w-16 px-0 text-center text-lg font-semibold tabular-nums"
							inputmode="numeric"
							autocomplete="off"
							maxlength={SCORE_INPUT_MAX_LENGTH}
							aria-label="Game {index + 1}, opponents' points"
							{...a11y.attrs}
						/>
						{#if form.canRemoveGame}
							<Button
								type="button"
								variant="ghost"
								class="ml-auto min-h-11 px-3 text-sm font-normal text-muted hover:text-secondary"
								aria-label="Remove game {index + 1}"
								onclick={() => removeGame(index)}>Remove</Button
							>
						{/if}
					</div>
					{#if gameError}
						<FieldError id={a11y.errorId}>{gameError}</FieldError>
					{/if}
				</div>
			{/each}
			{#if errors.games}
				<FieldError id="games-error">{first('games')}</FieldError>
			{/if}
		</div>
		<div>
			{#if form.canAddGame}
				<Button
					id="add-game"
					type="button"
					variant="ghost"
					size="sm"
					class="mt-2 min-h-11 px-3"
					onclick={addGame}
				>
					<span aria-hidden="true">+</span> Add a game
				</Button>
			{/if}
			<p class="mt-2 text-sm text-faint">Up to 5 games.</p>
		</div>
	</FieldSet>

	<div class="mt-8 grid gap-3 border-t border-line pt-6">
		<div>
			<Button type="submit" aria-disabled={form.sending} aria-describedby="submit-note">
				{#if form.sending}<Spinner />{/if}
				{form.sending ? 'Recording…' : 'Record and confirm score'}
			</Button>
		</div>
		<p id="submit-note" class="max-w-md text-base text-muted">
			This confirms the score for your team. The match stays pending until a player on the other
			team confirms it too.
		</p>
	</div>
</form>
