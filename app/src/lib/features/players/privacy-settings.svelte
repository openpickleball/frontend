<script lang="ts">
	import { Alert, AlertDescription } from '#lib/ui/alert/index.js';
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
				<div class="grid gap-0.5">
					<label for="privacy-{row.key}" class="text-base font-semibold text-secondary">
						{row.label}
					</label>
					<span id="privacy-{row.key}-state" class="text-sm text-muted">
						{shown ? 'Signed-in players' : 'Only me'}
					</span>
				</div>
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
