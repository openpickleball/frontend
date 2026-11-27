<script lang="ts">
	import { Alert, AlertDescription } from '#lib/ui/alert/index.js';
	import { Field, FieldDescription, FieldLabel } from '#lib/ui/field/index.js';
	import { Switch } from '#lib/ui/switch/index.js';
	import { PRIVACY_ROWS } from './settings.js';
	import type { Privacy, PrivacyKey } from './types.js';

	let {
		privacy,
		displayName,
		nameLocked,
		error,
		onchange
	}: {
		privacy: Privacy;
		/** The name other players see, as the backend built it. */
		displayName: string;
		/** The backend's `name_format_locked`: the name stays "First L." (13 to 17). */
		nameLocked: boolean;
		/** Why the last change was not saved, or `null`. */
		error: string | null;
		onchange: <K extends PrivacyKey>(key: K, value: Privacy[K]) => void;
	} = $props();

	const initial = $derived(nameLocked || privacy.name === 'first_last_initial');
</script>

<div class="grid gap-4">
	{#if error}
		<Alert variant="destructive" class="max-w-md">
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	<ul class="grid max-w-md divide-y divide-line border-y border-line">
		<!--
			The name comes from sign-up and can't be changed, only how the last name shows. The
			backend builds the name and sends it back, so the app never works it out. The lock is the
			backend's (13 to 17), which also refuses the full name: the disabled switch is only a
			convenience.
		-->
		<li class="flex items-center justify-between gap-4 py-3">
			<Field class="gap-0.5">
				<FieldLabel for="privacy-name" class="font-semibold">
					Show my last name as an initial
				</FieldLabel>
				<FieldDescription id="privacy-name-state">Shown as {displayName}</FieldDescription>
				{#if nameLocked}
					<FieldDescription id="privacy-name-note">
						This stays on until you turn 18.
					</FieldDescription>
				{/if}
			</Field>
			<Switch
				id="privacy-name"
				checked={initial}
				disabled={nameLocked}
				aria-describedby={nameLocked
					? 'privacy-name-state privacy-name-note'
					: 'privacy-name-state'}
				onCheckedChange={(on) => onchange('name', on ? 'first_last_initial' : 'full')}
			/>
		</li>
		{#each PRIVACY_ROWS as row (row.key)}
			{@const shown = privacy[row.key] === 'signed_in'}
			<!-- Match history says which matches others see, which the Matches page used to say. -->
			{@const note =
				shown && row.key === 'match_history'
					? 'Other signed-in players see your confirmed matches.'
					: null}
			<li class="flex items-center justify-between gap-4 py-3">
				<Field class="gap-0.5">
					<FieldLabel for="privacy-{row.key}" class="font-semibold">{row.label}</FieldLabel>
					<FieldDescription id="privacy-{row.key}-state">
						{shown ? 'Signed-in players' : 'Only me'}
					</FieldDescription>
					{#if note}
						<FieldDescription id="privacy-{row.key}-note">{note}</FieldDescription>
					{/if}
				</Field>
				<Switch
					id="privacy-{row.key}"
					checked={shown}
					aria-describedby={note
						? `privacy-${row.key}-state privacy-${row.key}-note`
						: `privacy-${row.key}-state`}
					onCheckedChange={(on) => onchange(row.key, on ? 'signed_in' : 'private')}
				/>
			</li>
		{/each}
		<!--
			Current ratings have the backend's rules (ADR 0031): an adult's are always shown, and a
			player who joined at 13 to 17 starts private and may show them from 18. Showing them
			can't be undone. Only a private setting gets a switch, and the backend decides the age.
		-->
		{#if privacy.rating === 'private'}
			<li class="flex items-center justify-between gap-4 py-3">
				<Field class="gap-0.5">
					<FieldLabel for="privacy-rating" class="font-semibold">Current ratings</FieldLabel>
					<FieldDescription id="privacy-rating-state">Only me</FieldDescription>
					<FieldDescription id="privacy-rating-note">
						From age 18, you can show them to signed-in players. After that, they can't be hidden
						again.
					</FieldDescription>
				</Field>
				<Switch
					id="privacy-rating"
					checked={false}
					aria-describedby="privacy-rating-state privacy-rating-note"
					onCheckedChange={(on) => {
						if (on) onchange('rating', 'signed_in');
					}}
				/>
			</li>
		{:else}
			<li class="grid gap-0.5 py-3" data-testid="privacy-rating-fixed">
				<span class="font-semibold text-secondary">Current ratings</span>
				<span class="text-sm text-muted">Signed-in players</span>
				<span class="text-sm text-muted">Always shown. They can't be hidden.</span>
			</li>
		{/if}
	</ul>
</div>
