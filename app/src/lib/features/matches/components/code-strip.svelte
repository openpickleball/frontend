<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { PlayerCode } from '#lib/domain/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '#lib/ui/button/index.js';

	let { code }: { code: PlayerCode } = $props();

	// The compact variant of the profile's code card, for the home screen: the same label style,
	// and the code and a Copy button. Share is on the profile.
	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			toast('Code copied');
		} catch {
			toast("Couldn't copy. Select the code and copy it by hand.");
		}
	}
</script>

<div
	class="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-line py-4"
>
	<p class="grid gap-1">
		<span class="label">Your OPEN code</span>
		<span class="font-display text-xl tracking-wide text-secondary" data-testid="my-code"
			>{code}</span
		>
	</p>
	<Button variant="outline" size="sm" onclick={copy}>
		<CopyIcon aria-hidden="true" />
		Copy code
	</Button>
</div>
