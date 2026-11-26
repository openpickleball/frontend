<script lang="ts">
	import { Alert, AlertDescription } from '#lib/ui/alert/index.js';
	import { Field, FieldDescription, FieldLabel } from '#lib/ui/field/index.js';
	import { Switch } from '#lib/ui/switch/index.js';
	import { PRIVACY_ROWS } from './settings.js';
	import type { Privacy, PrivacyKey, Visibility } from './types.js';

	let {
		privacy,
		error,
		onchange
	}: {
		privacy: Privacy;
		/** Why the last change was not saved, or `null`. */
		error: string | null;
		onchange: (key: PrivacyKey, visibility: Visibility) => void;
	} = $props();
</script>

<div class="grid gap-4">
	<p class="max-w-md text-base text-muted">
		Choose what other signed-in players can see. Your display name is always shown to them.
	</p>

	{#if error}
		<Alert variant="destructive" class="max-w-md">
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	<ul class="grid max-w-md divide-y divide-line border-y border-line">
		{#each PRIVACY_ROWS as row (row.key)}
			{@const shown = privacy[row.key] === 'signed_in'}
			<li class="flex items-center justify-between gap-4 py-3">
				<Field class="gap-0.5">
					<FieldLabel for="privacy-{row.key}" class="font-semibold">{row.label}</FieldLabel>
					<FieldDescription id="privacy-{row.key}-state">
						{shown ? 'Signed-in players' : 'Only me'}
					</FieldDescription>
				</Field>
				<Switch
					id="privacy-{row.key}"
					checked={shown}
					aria-describedby="privacy-{row.key}-state"
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
