<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';

	let { code }: { code: PlayerCode } = $props();

	let message = $state('');
	onDestroy(() => clearTimeout(timer));
	let timer: ReturnType<typeof setTimeout> | undefined;

	function say(text: string) {
		message = text;
		clearTimeout(timer);
		timer = setTimeout(() => (message = ''), 4000);
	}

	async function copy(): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(code);
			return true;
		} catch {
			return false;
		}
	}

	async function onCopy() {
		say((await copy()) ? 'Code copied' : "Couldn't copy. Select the code and copy it by hand.");
	}

	// Share with the device's own share sheet when there is one, and copy otherwise.
	async function onShare() {
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ title: 'My OPEN code', text: `My OPEN code is ${code}` });
				return;
			} catch (error) {
				// Closing the share sheet is not a failure.
				if (error instanceof DOMException && error.name === 'AbortError') return;
			}
		}
		say((await copy()) ? 'Code copied' : "Couldn't share. Select the code and copy it by hand.");
	}
</script>

<section class="grid gap-3" aria-labelledby="code-title">
	<h2 id="code-title" class="font-display text-[11px] tracking-[0.14em] text-muted uppercase">
		Your OPEN code
	</h2>
	<p
		class="font-display text-[clamp(26px,8vw,40px)] leading-tight tracking-wide break-words text-secondary"
		data-testid="my-code"
	>
		{code}
	</p>
	<p class="max-w-[44ch] text-muted">
		Share it with the people you play. They need it to add you to a match.
	</p>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="outline" size="sm" onclick={onCopy}>Copy code</Button>
		<Button variant="outline" size="sm" onclick={onShare}>Share</Button>
		<span class="min-h-6 text-[15px] text-muted" role="status">{message}</span>
	</div>
</section>
