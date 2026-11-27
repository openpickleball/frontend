<script lang="ts">
	import { untrack } from 'svelte';
	import { session } from '#lib/features/auth/index.js';
	import { SelectField, TextField } from '#lib/ui/field/index.js';
	import { CLUB_CODE_HINT, CLUB_PICKER_HINT, NO_CLUB } from '../copy.js';
	import { listClubGrants, type ClubGrant } from '../services.js';

	/**
	 * The optional club of a new Event. An admin member picks from the clubs that allow the
	 * organizer (`club-grants`). A match manager can't read that list, so they type the club's code,
	 * as does an admin whose read failed. An admin known to have no two-factor gets the code input
	 * with no read at all: the backend would answer 403 `mfa_required`, which also fires the
	 * app-wide toast. The backend checks the club either way.
	 */
	let {
		id = 'event-club',
		organizer,
		admin,
		value = $bindable(''),
		error = '',
		onchange
	}: {
		id?: string;
		/** The organizer's code. The grants are read for it. */
		organizer: string;
		/** Only an admin member may read the grants. */
		admin: boolean;
		value?: string;
		error?: string;
		onchange?: (value: string) => void;
	} = $props();

	let status = $state<'loading' | 'picker' | 'code'>('code');
	let grants = $state<ClubGrant[]>([]);
	let read = 0;

	$effect(() => {
		const code = organizer;
		if (!admin || !code || session.mfaEnrolled === false) {
			// A read still in flight must not bring the picker back.
			read++;
			status = 'code';
			return;
		}
		untrack(() => {
			const mine = ++read;
			status = 'loading';
			listClubGrants(code).then(
				(found) => {
					if (mine !== read) return;
					grants = found;
					status = 'picker';
				},
				() => {
					if (mine === read) status = 'code';
				}
			);
		});
	});

	// A club belongs to one organizer's grants: switching organizer clears it, so a club the new
	// picker or code input does not show is never sent.
	let shownFor = untrack(() => organizer);
	$effect(() => {
		const code = organizer;
		if (code === shownFor) return;
		shownFor = code;
		untrack(() => {
			if (value === '') return;
			value = '';
			onchange?.('');
		});
	});

	const options = $derived(
		grants.map((g) => ({ value: g.club, label: g.city ? `${g.name} (${g.city})` : g.name }))
	);

	function changed(event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) {
		value = event.currentTarget.value;
		onchange?.(value);
	}
</script>

{#if status === 'code'}
	<TextField
		{id}
		label="Club code"
		autocomplete="off"
		autocapitalize="characters"
		spellcheck="false"
		bind:value
		oninput={changed}
		{error}
		hint={CLUB_CODE_HINT}
	/>
{:else}
	<SelectField
		{id}
		label="Club"
		placeholder={status === 'loading' ? 'Loading clubs…' : NO_CLUB}
		options={status === 'loading' ? [] : options}
		disabled={status === 'loading'}
		bind:value
		onchange={changed}
		{error}
		hint={CLUB_PICKER_HINT}
	/>
{/if}
