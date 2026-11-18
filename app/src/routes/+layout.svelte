<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { AppShell } from '#lib/ui/app-shell/index.js';
	import { Toaster } from '#lib/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<AppShell pathname={page.url.pathname}>
	{@render children()}
</AppShell>
<Toaster />
