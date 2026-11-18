<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';

	let { code }: { code: PlayerCode } = $props();

	// The home screen's short version of the profile's code card: the code and a Copy button.
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
		<span class="text-[15px] text-muted">Your OPEN code</span>
		<span class="font-display text-xl tracking-wide text-secondary" data-testid="my-code"
			>{code}</span
		>
	</p>
	<Button variant="outline" size="sm" onclick={copy}>Copy code</Button>
</div>
