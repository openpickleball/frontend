<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
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
		/** The player's name, when they were picked from a search. It shows beside the code. */
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

	// A combobox with a listbox (WAI-ARIA): focus stays in the box, and `aria-activedescendant`
	// points at the option the arrow keys are on.
	// svelte-ignore state_referenced_locally
	const finder = new PlayerSearch({
		search,
		// A code, whole or part, is not a name.
		skip: looksLikeCode
	});
	onDestroy(() => finder.clear());

	let listbox = $state<HTMLElement | null>(null);
	let open = $state(false);
	let active = $state(-1);

	const listId = $derived(`${id}-listbox`);
	const optionId = (index: number) => `${id}-option-${index}`;
	const hits = $derived(finder.items.filter((hit) => !exclude.includes(hit.code)));
	const showList = $derived(open && hits.length > 0 && finder.status !== 'empty');
	const note = $derived.by(() => {
		if (!open || showList) return '';
		if (finder.status === 'loading') return 'Searching…';
		if (finder.status === 'results') {
			return 'No players found. Check the spelling or enter their OPEN code.';
		}
		return finder.message;
	});
	/** What a screen reader hears when the results change. */
	const announcement = $derived.by(() => {
		if (!open) return '';
		if (showList) {
			const count = hits.length;
			// The first name makes the text differ when a new search returns the same count.
			return `${count} ${count === 1 ? 'player' : 'players'} found, starting with ${hits[0].name}. Use the up and down arrow keys to choose.`;
		}
		return finder.status === 'loading' ? '' : note;
	});

	// Search as the player types. Once there is a chip, the text is empty and the search ends.
	$effect(() => {
		finder.query(text);
		active = -1;
		open = text.trim().length >= MIN_SEARCH_LENGTH;
	});
	$effect(() => {
		void hits;
		active = -1;
	});

	// On a phone the bottom bar and the keyboard cover the page. Bring the list into view.
	$effect(() => {
		if (showList) listbox?.scrollIntoView({ block: 'nearest' });
	});

	function pick(hit: PlayerHit) {
		open = false;
		active = -1;
		finder.clear();
		onpick?.(hit);
	}

	async function onkeydown(event: KeyboardEvent) {
		const count = hits.length;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (count === 0) return;
			event.preventDefault();
			if (!showList) {
				open = true;
				active = event.key === 'ArrowDown' ? 0 : count - 1;
				return;
			}
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = active === -1 ? (step === 1 ? 0 : count - 1) : (active + step + count) % count;
			return;
		}
		if (event.key === 'Escape') {
			if (!open || (!showList && note === '')) return;
			event.preventDefault();
			event.stopPropagation();
			open = false;
			active = -1;
			return;
		}
		// Enter would submit the whole form. Here it picks the option under the arrows, or checks the code.
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (showList && active >= 0) {
			pick(hits[active]);
			return;
		}
		oncommit();
		await tick();
		document.getElementById(id)?.focus();
	}

	function onblur() {
		open = false;
		oncommit();
	}

	async function remove() {
		onremove();
		await tick();
		input?.focus();
	}
</script>

<div class="grid gap-1.5">
	{#if code}
		<div class="flex">
			<span
				class={[
					'inline-flex min-h-11 items-center gap-2 rounded-full border bg-surface pr-1.5 pl-4 text-secondary',
					error ? 'border-danger' : locked ? 'border-line' : 'border-secondary'
				]}
			>
				{#if locked}
					<span class="text-[13px] font-semibold text-muted">You</span>
				{/if}
				<span class={['font-display tracking-wide', error && 'text-danger']} data-testid="chip"
					>{code}</span
				>
				{#if name}
					<span class="text-[15px] text-muted" data-testid="chip-name">{name}</span>
				{/if}
				{#if locked}
					<span class="mr-2.5"></span>
				{:else}
					<button
						type="button"
						{id}
						onclick={remove}
						aria-label="Remove {code}"
						aria-describedby={error ? `${id}-error` : undefined}
						class="grid size-9 place-items-center rounded-full text-muted hover:text-secondary focus-visible:outline-offset-0"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="round"
							aria-hidden="true"
							class="size-4"
						>
							<path d="M6 6l12 12M18 6 6 18" />
						</svg>
					</button>
				{/if}
			</span>
		</div>
	{:else}
		<div class="relative">
			<Input
				{id}
				bind:ref={input}
				bind:value={text}
				{onkeydown}
				{onblur}
				onfocus={() => (open = text.trim().length >= MIN_SEARCH_LENGTH)}
				role="combobox"
				aria-expanded={showList}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
				aria-label={label}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				class="font-display tracking-wide"
				type="text"
				autocomplete="off"
				autocapitalize="none"
				autocorrect="off"
				spellcheck={false}
				maxlength={64}
				{placeholder}
			/>
			<ul
				id={listId}
				bind:this={listbox}
				role="listbox"
				aria-label="Matching players"
				hidden={!showList}
				class="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 scroll-mb-28 overflow-auto rounded-2xl border border-field bg-surface py-1 shadow-lg"
			>
				{#if showList}
					{#each hits as hit, index (hit.code)}
						<!-- Keys are handled by the box above, so focus never leaves it. -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li
							id={optionId(index)}
							role="option"
							aria-selected={index === active}
							class={[
								'flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 px-5 py-1.5',
								index === active ? 'bg-line text-secondary' : 'text-secondary hover:bg-line'
							]}
							onmousedown={(event) => event.preventDefault()}
							onmouseenter={() => (active = index)}
							onclick={() => pick(hit)}
						>
							<span class="font-medium">{hit.name}</span>
							<span class="font-display text-sm tracking-wide text-muted">{hit.code}</span>
						</li>
					{/each}
				{/if}
			</ul>
			{#if note}
				<p
					class="absolute inset-x-0 top-full z-20 mt-1.5 rounded-2xl border border-field bg-surface px-5 py-3 text-sm text-muted shadow-lg"
					data-testid="search-note"
				>
					{note}
				</p>
			{/if}
			<div class="sr-only" role="status" aria-live="polite" data-testid="search-status">
				{announcement}
			</div>
		</div>
	{/if}
	{#if error}
		<FieldError id="{id}-error" message={error} />
	{/if}
</div>
