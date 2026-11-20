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
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import { Label } from '#lib/ui/label/index.js';
	import { createDraftStore, isBlank, type DraftStore } from '../draft.js';
	import { RecordForm } from '../form.svelte.js';
	import { searchPlayers, type SearchFn } from '../search.js';
	import { submitMatch, type SubmitResult } from '../service.js';
	import FieldError from './field-error.svelte';
	import Notice from './notice.svelte';
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

	let summaryBox = $state<HTMLElement | null>(null);
	let failureBox = $state<HTMLElement | null>(null);

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
	const gameErrorId = (index: number) => `game-${index}-error`;
</script>

<form {onsubmit} novalidate class="grid gap-2">
	{#if summary.length > 0}
		<div class="mt-8">
			<Notice
				id="error-summary"
				bind:element={summaryBox}
				title={summary.length === 1
					? 'Fix 1 thing to record this match'
					: `Fix ${summary.length} things to record this match`}
			>
				<ul class="grid gap-1">
					{#each summary as entry (entry.key)}
						<li>
							{#if entry.target}
								{@const target = entry.target}
								<a
									href="#{target}"
									class="underline underline-offset-4"
									onclick={(event) => focusField(event, target)}>{entry.message}</a
								>
							{:else}
								{entry.message}
							{/if}
						</li>
					{/each}
				</ul>
			</Notice>
		</div>
	{/if}

	{#if form.failure?.kind === 'offline'}
		<div class="mt-8">
			<Notice bind:element={failureBox} title={form.failure.message}>
				<p class="text-muted">
					Everything you entered is still here. Check your matches before you try again, so the same
					match is not recorded twice. Then connect to the internet and send it again.
				</p>
			</Notice>
		</div>
	{:else if form.failure?.kind === 'duplicate'}
		<div class="mt-8">
			<Notice bind:element={failureBox} title={form.failure.message}>
				{#if form.failure.matchCode}
					<p>
						<a
							href={resolve('/matches/[code]', { code: form.failure.matchCode })}
							class="font-semibold underline underline-offset-4">See the match</a
						>
					</p>
					<p class="text-muted">You may still need to confirm it.</p>
				{:else}
					<p class="text-muted">
						Look in <a
							href={resolve(ROUTES.matches)}
							class="font-semibold underline underline-offset-4">your matches</a
						> to find it. You may still need to confirm it.
					</p>
				{/if}
			</Notice>
		</div>
	{:else if form.failure?.kind === 'forbidden'}
		<div class="mt-8">
			<Notice bind:element={failureBox} title={form.failure.message}>
				<p class="text-muted">Everything you entered is still here.</p>
				{#if onchangecode}
					<div>
						<Button type="button" variant="outline" size="sm" onclick={onchangecode}>
							Change my code
						</Button>
					</div>
				{/if}
			</Notice>
		</div>
	{:else if form.failure?.kind === 'other'}
		<div class="mt-8">
			<Notice bind:element={failureBox} title="We couldn't record this match">
				<p class="text-muted">{form.failure.message}</p>
			</Notice>
		</div>
	{/if}

	<fieldset class="mt-8 grid gap-4 border-t border-line pt-3">
		<legend class="text-xl font-semibold text-secondary">Match</legend>
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
					aria-invalid={errors.played_on ? 'true' : undefined}
					aria-describedby={errors.played_on
						? 'played-on-error'
						: form.dateHint
							? 'played-on-hint'
							: undefined}
					onblur={() => form.touch('played_on')}
				/>
				{#if errors.played_on}
					<FieldError id="played-on-error" message={first('played_on')} />
				{:else if form.dateHint}
					<p id="played-on-hint" class="text-base text-muted">{form.dateHint}</p>
				{/if}
			</div>
		</div>
	</fieldset>

	<fieldset class="mt-8 grid gap-4 border-t border-line pt-3">
		<legend class="text-xl font-semibold text-secondary">Players</legend>
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
	</fieldset>

	<fieldset class="mt-8 grid gap-4 border-t border-line pt-3">
		<legend class="text-xl font-semibold text-secondary">Scoring</legend>
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
	</fieldset>

	<fieldset class="mt-8 grid gap-4 border-t border-line pt-3">
		<legend class="text-xl font-semibold text-secondary">Games</legend>
		<div class="grid max-w-sm">
			<div class="flex items-center gap-x-2 pb-2 text-xs text-faint" aria-hidden="true">
				<span class="w-20"></span><span class="w-16 text-center">You</span><span class="w-4"
				></span><span class="w-16 text-center">Opponents</span>
			</div>
			{#each form.games as game, index (index)}
				{@const gameError = errors[`games.${index}`]?.[0] ?? ''}
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
							aria-invalid={gameError ? 'true' : undefined}
							aria-describedby={gameError ? gameErrorId(index) : undefined}
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
							aria-invalid={gameError ? 'true' : undefined}
							aria-describedby={gameError ? gameErrorId(index) : undefined}
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
						<FieldError id={gameErrorId(index)} message={gameError} />
					{/if}
				</div>
			{/each}
			{#if errors.games}
				<FieldError id="games-error" message={first('games')} />
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
	</fieldset>

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
