<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { toast } from 'svelte-sonner';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';

	let { code }: { code: PlayerCode } = $props();

	async function copy(): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(code);
			return true;
		} catch {
			return false;
		}
	}

	async function onCopy() {
		toast((await copy()) ? 'Code copied' : "Couldn't copy. Select the code and copy it by hand.");
	}

	// Only offer Share where the device has a share sheet. Elsewhere, Copy code does the job.
	const canShare = typeof navigator.share === 'function';

	async function onShare() {
		try {
			await navigator.share({ title: 'My OPEN code', text: `My OPEN code is ${code}` });
		} catch (error) {
			// Closing the share sheet is not a failure.
			if (error instanceof DOMException && error.name === 'AbortError') return;
			toast("Couldn't share. Use Copy code instead.");
		}
	}
</script>

<section class="grid gap-3" aria-labelledby="code-title">
	<h2 id="code-title" class="label">Your OPEN code</h2>
	<!-- eslint-disable local/no-arbitrary-tailwind-values -- fluid size so the code fits one line on narrow phones, no default -->
	<p
		class="open-code text-[clamp(26px,8vw,40px)] leading-tight break-words text-secondary"
		data-testid="my-code"
	>
		{code}
	</p>
	<!-- eslint-enable local/no-arbitrary-tailwind-values -->
	<p class="max-w-md text-muted">
		Share it with the people you play. They need it to add you to a match.
	</p>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="outline" size="sm" onclick={onCopy}>
			<CopyIcon aria-hidden="true" />
			Copy code
		</Button>
		{#if canShare}
			<Button variant="outline" size="sm" onclick={onShare}>Share</Button>
		{/if}
	</div>
</section>
