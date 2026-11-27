<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import {
		ReauthPrompt,
		SignOutButton,
		isAccountPath,
		onSignOut,
		requestReauth,
		session,
		setSignOutWarning,
		watchMfaRequired,
		watchSessionExpiry
	} from '#lib/features/auth/index.js';
	import { matchCache, ownerKey, rememberMatch } from '#lib/features/matches/index.js';
	import {
		QueueNotice,
		offlineQueue,
		signOutWarning,
		type QueuedMatch,
		type SentMatch
	} from '#lib/features/offline/index.js';
	import { toast } from 'svelte-sonner';
	import { ROUTES } from '#lib/domain/index.js';
	import { myCode } from '#lib/features/players/index.js';
	import { AppShell } from '#lib/ui/app-shell/index.js';
	import { Toaster } from '#lib/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

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

	// The offline queue belongs to the signed-in account, and sends when it is set (frontend#33).
	$effect(() => {
		const email = session.isSignedIn ? session.email : null;
		untrack(() => void offlineQueue.setAccount(email));
	});
	onDestroy(offlineQueue.start());
	// On app open, delete matches that waited too long, for every account on this device.
	void offlineQueue.purgeExpired();

	// Signing out on purpose clears the code and name at once, before the backend answers. It also
	// deletes this account's unsent matches from the device, after the Sign out button warned.
	onDestroy(
		onSignOut(() => {
			myCode.reset();
			void offlineQueue.forget();
		})
	);
	onDestroy(setSignOutWarning(() => signOutWarning(offlineQueue.unsent)));

	// Say when queued matches reach the backend, and hand new ones to the match cache.
	onDestroy(offlineQueue.onSent(announceSent));

	function announceSent(sent: SentMatch[]) {
		for (const item of sent) if (item.match) rememberMatch(item.match);
		const [only] = sent;
		if (sent.length === 1 && only.code) {
			const code = only.code;
			toast(only.duplicate ? 'Your match was already recorded' : 'Your match was sent', {
				action: {
					label: 'View',
					onClick: () => void goto(resolve('/matches/[code]', { code }))
				}
			});
			return;
		}
		toast(sent.length === 1 ? 'Your match was sent' : `${sent.length} matches were sent`, {
			action: { label: 'View', onClick: () => void goto(resolve(ROUTES.matches)) }
		});
	}

	function fix(item: QueuedMatch) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the path, the query is added after
		void goto(`${resolve(ROUTES.record)}?fix=${encodeURIComponent(item.id)}`);
	}

	// When the session ends mid-use, the first 401 marks this device signed out, which clears the
	// code and the cache above. Re-running the loads lets the guard send the player to sign in,
	// with `next` set to this page. Set up at the top level, before any child page calls the API.
	onDestroy(watchSessionExpiry(() => void invalidateAll()));

	// Any 403 `mfa_required` gets one explanation, not each screen's own error. An account with
	// two-factor only has to confirm with a code in this session; any other needs to set it up.
	onDestroy(
		watchMfaRequired((enrolled) => {
			if (enrolled) {
				toast('Confirm with a code from your authenticator app.', {
					id: 'mfa-required',
					description: 'This needs a session that passed two-factor. Then try again.',
					action: { label: 'Enter a code', onClick: () => void requestReauth(['code']) }
				});
				return;
			}
			toast('This needs two-factor authentication.', {
				id: 'mfa-required',
				description: 'Set up two-factor authentication in your profile, then try again.',
				action: { label: 'Set up two-factor', onClick: () => void goto(resolve(ROUTES.twoFactor)) }
			});
		})
	);
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
	{#if session.isSignedIn && !isAccountPath(page.url.pathname)}
		<QueueNotice onfix={fix} />
	{/if}
	{@render children()}
</AppShell>
<Toaster />
<!-- One prompt for every call that needs a recent password or code (withReauth). -->
<ReauthPrompt />

{#snippet signOut()}
	<SignOutButton />
{/snippet}
