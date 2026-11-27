<script lang="ts">
	import { Button } from '#lib/ui/button/index.js';

	/** New recovery codes, shown once. The player saves them, or copies them all at once. */
	let { codes }: { codes: string[] } = $props();

	/** The codes last copied, so "Copied." shows only while those same codes are on screen. */
	let copiedText = $state<string | null>(null);
	const text = $derived(codes.join('\n'));
	const copied = $derived(copiedText === text);

	async function copy() {
		const copying = text;
		try {
			await navigator.clipboard.writeText(copying);
			copiedText = copying;
		} catch {
			// No clipboard here (or the browser said no). The codes stay on screen to write down.
			copiedText = null;
		}
	}
</script>

<div class="grid gap-4">
	<p class="max-w-md text-base text-muted">
		Save these recovery codes somewhere safe. They are shown only once. Each one signs you in once
		if you can't use your authenticator app.
	</p>
	<ul class="grid grid-cols-2 gap-2 font-mono text-base text-secondary" aria-label="Recovery codes">
		{#each codes as code (code)}
			<li>{code}</li>
		{/each}
	</ul>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="outline" size="sm" onclick={copy}>Copy codes</Button>
		<span class="text-sm text-muted" role="status">{copied ? 'Copied.' : ''}</span>
	</div>
</div>
