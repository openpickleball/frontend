<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { GameTarget, MatchFormat, PlayerCode, ScoringType } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import { Label } from '#lib/ui/label/index.js';
	import { RecordForm, todayLocal } from '../form.svelte.js';
	import { submitMatch, type SubmitResult } from '../service.js';
	import FieldError from './field-error.svelte';
	import Notice from './notice.svelte';
	import PlayerSlot from './player-slot.svelte';
	import Segmented from './segmented.svelte';

	let {
		own,
		onrecorded,
		submit = submitMatch
	}: {
		/** The signed-in player's own OPEN code. */
		own: PlayerCode;
		/** Called once the match is saved. `result.confirmError` is set if the confirmation failed. */
		onrecorded: (result: SubmitResult) => void;
		/** The service that sends the match. Tests pass a stand-in. */
		submit?: typeof submitMatch;
	} = $props();

	// The form belongs to one player. The page remounts this if their code changes.
	// svelte-ignore state_referenced_locally
	const form = new RecordForm(own);

	let summaryBox = $state<HTMLElement | null>(null);
	let failureBox = $state<HTMLElement | null>(null);

	const errors = $derived(form.errors);
	const summary = $derived(form.submitted ? form.summary : []);
	const maxDate = todayLocal();

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		const result = await form.send(submit);
		if (result) {
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
		if (!row.contains(event.relatedTarget as Node | null)) form.touch(`games.${index}`);
	}

	const first = (key: string) => errors[key]?.[0] ?? '';
	const gameErrorId = (index: number) => `game-${index}-error`;
</script>

<form {onsubmit} novalidate class="grid gap-2">
	{#if summary.length > 0}
		<div class="mt-6">
			<Notice
				id="error-summary"
				bind:element={summaryBox}
				title={summary.length === 1
					? 'Fix 1 thing to record this match'
					: `Fix ${summary.length} things to record this match`}
			>
				<ul class="grid gap-1 pl-5">
					{#each summary as entry (entry.key)}
						<li class="list-disc">
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
		<div class="mt-6">
			<Notice bind:element={failureBox} title={form.failure.message}>
				<p class="text-muted">
					Everything you entered is still here. Connect to the internet and try again.
				</p>
			</Notice>
		</div>
	{:else if form.failure?.kind === 'duplicate'}
		<div class="mt-6">
			<Notice bind:element={failureBox} title={form.failure.message}>
				{#if form.failure.matchCode}
					<p>
						<a
							href={resolve('/matches/[code]', { code: form.failure.matchCode })}
							class="font-semibold underline underline-offset-4">See the match</a
						>
					</p>
				{:else}
					<p class="text-muted">
						Look in <a href={resolve('/matches')} class="font-semibold underline underline-offset-4"
							>your matches</a
						> to find it.
					</p>
				{/if}
			</Notice>
		</div>
	{:else if form.failure?.kind === 'other'}
		<div class="mt-6">
			<Notice bind:element={failureBox} title="We could not record this match">
				<p class="text-muted">{form.failure.message}</p>
			</Notice>
		</div>
	{/if}

	<fieldset class="mt-8 grid gap-6">
		<legend class="label mb-5">Match</legend>
		<div class="flex flex-wrap items-start gap-x-10 gap-y-6">
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
					aria-invalid={errors.played_on ? 'true' : undefined}
					aria-describedby={errors.played_on ? 'played-on-error' : undefined}
					onblur={() => form.touch('played_on')}
				/>
				{#if errors.played_on}
					<FieldError id="played-on-error" message={first('played_on')} />
				{/if}
			</div>
		</div>
	</fieldset>

	<fieldset class="mt-8 grid gap-6">
		<legend class="label mb-1">Players</legend>
		<p class="max-w-[52ch] text-[15px] text-muted">
			Enter each player's OPEN code. They can find theirs on their Profile page. Names show once the
			match is saved.
		</p>

		<div class="grid gap-3" role="group" aria-labelledby="team-a-title">
			<h3 id="team-a-title" class="text-lg font-medium text-secondary">Your team</h3>
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
					label="Your partner's OPEN code"
					placeholder="Partner: P-XXXX-XXXX"
					code={form.partner.code}
					bind:text={form.partner.text}
					error={first('team_a.1') || first('team_a')}
					oncommit={() => form.commit(form.partner)}
					onremove={() => form.remove(form.partner)}
				/>
			{/if}
		</div>

		<div class="grid gap-3" role="group" aria-labelledby="team-b-title">
			<h3 id="team-b-title" class="text-lg font-medium text-secondary">Opponents</h3>
			{#each form.visibleOpponents as slot, index (index)}
				<PlayerSlot
					id="opponent-{index}"
					label={form.doubles
						? `${index === 0 ? 'First' : 'Second'} opponent's OPEN code`
						: "Your opponent's OPEN code"}
					code={slot.code}
					bind:text={slot.text}
					error={first(`team_b.${index}`) || (index === 0 ? first('team_b') : '')}
					oncommit={() => form.commit(slot)}
					onremove={() => form.remove(slot)}
				/>
			{/each}
		</div>
	</fieldset>

	<fieldset class="mt-8 grid gap-6">
		<legend class="label mb-1">Scoring</legend>
		<div class="flex flex-wrap items-start gap-x-10 gap-y-6">
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

	<fieldset class="mt-8 grid gap-4">
		<legend class="label mb-1">Games</legend>
		<div class="grid gap-3">
			<div
				class="grid grid-cols-[4.5rem_5rem_1rem_5rem_auto] items-center gap-x-2 text-[11px] tracking-[0.14em] text-muted uppercase"
				aria-hidden="true"
			>
				<span></span><span class="text-center">You</span><span></span><span class="text-center"
					>Them</span
				>
			</div>
			{#each form.games as game, index (index)}
				{@const gameError = errors[`games.${index}`]?.[0] ?? ''}
				<div
					class="grid gap-1.5"
					role="group"
					aria-label="Game {index + 1}"
					onfocusout={(event) => leaveRow(event, index)}
				>
					<div class="grid grid-cols-[4.5rem_5rem_1rem_5rem_auto] items-center gap-x-2">
						<span class="text-[15px] font-semibold text-secondary">Game {index + 1}</span>
						<Input
							id="game-{index}-a"
							bind:value={game.a}
							class="px-2 text-center tabular-nums"
							inputmode="numeric"
							autocomplete="off"
							maxlength={3}
							aria-label="Game {index + 1}, your team's points"
							aria-invalid={gameError ? 'true' : undefined}
							aria-describedby={gameError ? gameErrorId(index) : undefined}
						/>
						<span class="text-center text-muted" aria-hidden="true">–</span>
						<Input
							id="game-{index}-b"
							bind:value={game.b}
							class="px-2 text-center tabular-nums"
							inputmode="numeric"
							autocomplete="off"
							maxlength={3}
							aria-label="Game {index + 1}, opponents' points"
							aria-invalid={gameError ? 'true' : undefined}
							aria-describedby={gameError ? gameErrorId(index) : undefined}
						/>
						{#if form.canRemoveGame}
							<Button
								type="button"
								variant="ghost"
								class="ml-1"
								aria-label="Remove game {index + 1}"
								onclick={() => form.removeGame(index)}>Remove</Button
							>
						{:else}
							<span></span>
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
				<Button type="button" variant="outline" size="sm" onclick={() => form.addGame()}>
					Add a game
				</Button>
			{/if}
			<p class="mt-2 text-sm text-faint">Up to 5 games.</p>
		</div>
	</fieldset>

	<div class="mt-8 grid gap-3 border-t border-line pt-6">
		<div>
			<Button type="submit" disabled={form.sending} aria-describedby="submit-note">
				{form.sending ? 'Recording…' : 'Record and confirm score'}
			</Button>
		</div>
		<p id="submit-note" class="max-w-[52ch] text-[15px] text-muted">
			This confirms the score for your team. The match stays pending until a player on the other
			team confirms it too.
		</p>
	</div>
</form>
