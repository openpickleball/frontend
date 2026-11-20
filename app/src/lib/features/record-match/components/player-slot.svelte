<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { onDestroy, tick, untrack } from 'svelte';
	import { CODE_INPUT_MAX_LENGTH, type PlayerCode } from '#lib/domain/index.js';
	import * as Combobox from '#lib/ui/combobox/index.js';
	import { Input } from '#lib/ui/input/index.js';
	import { PlayerSearch } from '../player-search.svelte.js';
	import {
		MIN_SEARCH_LENGTH,
		looksLikeCode,
		searchPlayers,
		type PlayerHit,
		type SearchFn
	} from '../search.js';
	import FieldError from './field-error.svelte';

	let {
		id,
		label,
		placeholder = 'Name or P-XXXX-XXXX',
		code,
		name = '',
		text = $bindable(''),
		error = '',
		locked = false,
		exclude = [],
		search = searchPlayers,
		oncommit,
		onpick,
		onremove
	}: {
		/** Id of the field. A chip's remove button takes the same id, so an error link finds either. */
		id: string;
		/** What a screen reader hears for the box, such as "Your partner's OPEN code". */
		label: string;
		placeholder?: string;
		/** The checked code, once there is one. It shows as a chip. */
		code: PlayerCode | null;
		/** The player's name, when they were picked from a search. The chip leads with it. */
		name?: string;
		/** What is typed, until it becomes a chip. */
		text?: string;
		error?: string;
		/** The player's own code: shown as "You", with nothing to remove. */
		locked?: boolean;
		/** Codes to leave out of the search results: the player and everyone already in the match. */
		exclude?: string[];
		/** The name search. Tests pass a stand-in. */
		search?: SearchFn;
		/** Turn the typed text into a chip. */
		oncommit: () => void;
		/** A player was picked from the search results. */
		onpick?: (hit: PlayerHit) => void;
		onremove: () => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let list = $state<HTMLElement | null>(null);

	// Bits UI's Combobox owns the list: the arrow keys, the highlighted option, Enter and Escape,
	// and the ARIA wiring. Focus stays in the box while the list is open.
	// svelte-ignore state_referenced_locally
	const finder = new PlayerSearch({
		search,
		// A code, whole or part, is not a name.
		skip: looksLikeCode
	});
	onDestroy(() => finder.clear());

	/** Whether the player wants the list: there is enough text, and Escape has not closed it. */
	let wanted = $state(false);
	/** What the slot last told a screen reader about itself, such as "Added Oren Quill." */
	let said = $state('');

	const hits = $derived(finder.items.filter((hit) => !exclude.includes(hit.code)));
	const showList = $derived(wanted && hits.length > 0 && finder.status !== 'empty');
	const note = $derived.by(() => {
		if (!wanted || showList) return '';
		if (finder.status === 'loading') return 'Searching…';
		if (finder.status === 'results') {
			// The backend found them, but each one is already in this match (or is the player).
			return finder.items.length === 1
				? 'That player is already in this match.'
				: 'Those players are already in this match.';
		}
		return finder.message;
	});
	/** What a screen reader hears when the results change. */
	const announcement = $derived.by(() => {
		if (code) return said;
		if (!wanted) return '';
		if (showList) {
			const count = hits.length;
			// The first name makes the text differ when a new search returns the same count.
			return `${count} ${count === 1 ? 'player' : 'players'} found, starting with ${hits[0].name}. Use the up and down arrow keys to choose, then Enter.`;
		}
		return finder.status === 'loading' ? '' : note;
	});

	// Search as the player types. Once there is a chip, the text is empty and the search ends.
	// Only the text drives this: the search reads its own results, which must not re-run it.
	$effect(() => {
		const typed = text;
		untrack(() => finder.query(typed));
		wanted = typed.trim().length >= MIN_SEARCH_LENGTH;
	});

	// On a phone the bottom bar and the keyboard cover the page. The list always opens below the
	// box, so bring it into view once it is placed, clear of the bar (scroll-mb-28).
	$effect(() => {
		if (!showList || !list) return;
		const node = list;
		const frame = requestAnimationFrame(() =>
			requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest' }))
		);
		return () => cancelAnimationFrame(frame);
	});

	/** Focus what the slot shows now: the chip's remove button, or the box. Both use `id`. */
	async function refocus(added: boolean) {
		await tick();
		if (added && code) said = `Added ${name || code}.`;
		document.getElementById(id)?.focus();
	}

	function pick(value: string | undefined) {
		const hit = hits.find((h) => h.code === value);
		if (!hit) return;
		wanted = false;
		finder.clear();
		onpick?.(hit);
		void refocus(true);
	}

	function onkeydown(event: KeyboardEvent) {
		// With the list open, Bits UI handles Enter: it picks the highlighted player. With it
		// closed, Enter would submit the whole form, so it checks the typed code instead.
		if (event.key !== 'Enter' || event.isComposing || showList) return;
		event.preventDefault();
		oncommit();
		void refocus(true);
	}

	function onblur() {
		wanted = false;
		oncommit();
	}

	async function remove() {
		onremove();
		said = '';
		await tick();
		input?.focus();
	}
</script>

<div class="grid gap-1.5">
	{#if code}
		<div class="flex min-w-0">
			<span
				class={[
					'inline-flex min-h-11 max-w-full min-w-0 items-center gap-x-2 rounded-3xl border bg-surface py-1 pl-4 text-secondary',
					locked ? 'pr-4' : 'pr-0',
					error ? 'border-danger' : locked ? 'border-line' : 'border-secondary'
				]}
			>
				{#if locked}
					<span class="text-sm font-semibold text-muted">You</span>
				{/if}
				{#if name}
					<!-- The name leads, as in the option it was picked from. A long one wraps, the code does not. -->
					<span class="min-w-0 font-medium break-words" data-testid="chip-name">{name}</span>
				{/if}
				<span
					class={[
						'shrink-0 font-display tracking-wide whitespace-nowrap',
						name && 'text-sm text-muted',
						error && 'text-danger'
					]}
					data-testid="chip">{code}</span
				>
				{#if !locked}
					<button
						type="button"
						{id}
						onclick={remove}
						aria-label="Remove {name || code}"
						aria-describedby={error ? `${id}-error` : undefined}
						class="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-secondary"
					>
						<XIcon aria-hidden="true" class="size-4" />
					</button>
				{/if}
			</span>
		</div>
	{:else}
		<Combobox.Root
			type="single"
			bind:open={() => showList, (value) => (wanted = value)}
			inputValue={text}
			onValueChange={pick}
		>
			<Combobox.Input
				{id}
				bind:ref={input}
				oninput={(event: Event) => (text = (event.currentTarget as HTMLInputElement).value)}
				{onkeydown}
				{onblur}
				onfocus={() => (wanted = text.trim().length >= MIN_SEARCH_LENGTH)}
				aria-label={label}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				type="text"
				autocomplete="off"
				autocapitalize="none"
				autocorrect="off"
				spellcheck={false}
				maxlength={CODE_INPUT_MAX_LENGTH}
				{placeholder}
			>
				{#snippet child({ props })}
					<div class="relative">
						<Input {...props} class="font-display tracking-wide" />
						{#if note}
							<p
								class="absolute inset-x-0 top-full z-20 mt-1.5 rounded-2xl border border-field bg-surface px-5 py-3 text-sm text-muted shadow-lg"
								data-testid="search-note"
							>
								{note}
							</p>
						{/if}
					</div>
				{/snippet}
			</Combobox.Input>
			<Combobox.Content
				bind:ref={list}
				aria-label="Matching players"
				avoidCollisions={false}
				class="scroll-mb-28"
			>
				{#each hits as hit (hit.code)}
					<Combobox.Item
						value={hit.code}
						label={hit.name}
						class="flex-wrap justify-between gap-x-4"
					>
						<span class="font-medium">{hit.name}</span>
						<span class="font-display text-sm tracking-wide text-muted">{hit.code}</span>
					</Combobox.Item>
				{/each}
			</Combobox.Content>
		</Combobox.Root>
	{/if}
	<!-- Outside the branches above, so it is still there to say "Added …" once the chip shows. -->
	<div class="sr-only" role="status" aria-live="polite" data-testid="search-status">
		{announcement}
	</div>
	{#if error}
		<FieldError id="{id}-error" message={error} />
	{/if}
</div>
