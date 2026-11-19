<script lang="ts">
	import { Button } from '#lib/ui/button/index.js';
	import { session } from '../session.svelte.js';
	import { bootstrap } from '../services.js';
	import Banner from './banner.svelte';

	/**
	 * Says so when the app could not read the session (the backend failed or could not be
	 * reached), instead of showing a sign-in form as if the player were signed out. Try again
	 * reads the session once more. Shows nothing once the session is known.
	 */
	let { onsignedin }: { onsignedin: () => void } = $props();

	let busy = $state(false);

	async function retry() {
		if (busy) return;
		busy = true;
		try {
			await bootstrap();
		} finally {
			busy = false;
		}
		if (session.isSignedIn) onsignedin();
	}
</script>

{#if session.status === 'unknown'}
	<div class="grid justify-items-start gap-3">
		<Banner
			kind="error"
			title="We couldn't check your sign-in."
			detail="Your connection may have dropped, or OPEN may be having a problem. Try again, or sign in below."
		/>
		<Button variant="outline" size="sm" onclick={retry} disabled={busy} aria-busy={busy}>
			{busy ? 'Checking…' : 'Try again'}
		</Button>
	</div>
{/if}
