<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { logout } from '../services.js';

	let { class: className }: { class?: string } = $props();
	let busy = $state(false);

	async function signOut() {
		if (busy) return;
		busy = true;
		try {
			await logout();
		} catch {
			// logout() has already cleared the session here, so leave either way.
		} finally {
			busy = false;
		}
		await goto(resolve(ROUTES.login));
	}
</script>

<Button variant="outline" size="sm" disabled={busy} onclick={signOut} class={className}>
	Sign out
</Button>
