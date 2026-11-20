<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import {
		SignOutButton,
		isAccountPath,
		onSignOut,
		session,
		sessionEmail,
		watchSessionExpiry
	} from '#lib/features/auth/index.js';
	import { matchCache, ownerKey } from '#lib/features/matches/index.js';
	import { myCode, setAccountEmailSource } from '#lib/features/players/index.js';
	import { AppShell } from '#lib/ui/app-shell/index.js';
	import { Toaster } from '#lib/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The players feature scopes the player's code to the account. Set at the top level of this
	// script, not in onMount: a child's onMount runs first. sessionEmail() waits for the session,
	// so it never says "signed out" while the session is still loading.
	setAccountEmailSource(sessionEmail);
	// The match cache belongs to one account and one player code. session.email is read straight
	// off the session store, because the cache needs the answer now, not a promise.
	matchCache.setOwnerSource(() => ownerKey(session.email, myCode.code));

	// A sign out or an account switch must never leave the last account's code in the store. The
	// first read of the session (from unknown) is not a change.
	let lastAccount: string | null = null;
	$effect(() => {
		if (session.status === 'unknown') return;
		const account = `${session.status}|${session.email}`;
		if (lastAccount !== null && lastAccount !== account) {
			untrack(() => {
				myCode.reset();
				matchCache.reset();
			});
		}
		lastAccount = account;
	});

	// Signing out on purpose also deletes the code saved in this browser, so a shared device keeps
	// no email or code. A session that merely expired keeps it: the player is coming back.
	onDestroy(onSignOut((email) => myCode.forget(email)));

	// When the session ends mid-use, the first 401 marks this device signed out, which clears the
	// code and the cache above. Re-running the loads lets the guard send the player to sign in,
	// with `next` set to this page. Set up at the top level, before any child page calls the API.
	onDestroy(watchSessionExpiry(() => void invalidateAll()));
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
