<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { SignOutButton, isAccountPath, session } from '#lib/features/auth/index.js';
	import { AppShell } from '#lib/ui/app-shell/index.js';
	import { Toaster } from '#lib/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- The sign-in and account pages have no nav: the player isn't signed in yet. -->
<AppShell
	pathname={page.url.pathname}
	bare={isAccountPath(page.url.pathname)}
	account={session.isSignedIn ? signOut : undefined}
>
	{@render children()}
</AppShell>
<Toaster />

{#snippet signOut()}
	<SignOutButton />
{/snippet}
