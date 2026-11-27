<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { PlayerCode } from '#lib/domain/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '#lib/ui/button/index.js';

	let { code, class: className = 'mt-8' }: { code: PlayerCode; class?: string } = $props();

	// The player's code on one line with Copy, at the top of Home and Profile. A line above, like a
	// section's, and none below: the next section's line follows.
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
	class={[
		'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-4',
		className
	]}
>
	<p class="grid gap-1">
		<span class="label">Your OPEN code</span>
		<span class="open-code text-xl text-secondary" data-testid="my-code">
			{code}
		</span>
	</p>
	<Button variant="outline" size="sm" onclick={copy}>
		<CopyIcon aria-hidden="true" />
		Copy code
	</Button>
</div>
