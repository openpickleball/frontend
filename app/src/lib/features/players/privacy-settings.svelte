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
	</ul>
</div>
