<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { ROUTES } from '#lib/domain/index.js';
	import { ProfileView, myCode } from '#lib/features/players/index.js';
	import { OrganizerMfaPrompt, SignOutButton, session } from '#lib/features/auth/index.js';
	import { APP_COMMIT, APP_VERSION, versionLabel } from '#lib/ui/app-version.js';
	import { FeedbackButton } from '#lib/ui/feedback/index.js';
	import {
		Item,
		ItemActions,
		ItemContent,
		ItemDescription,
		ItemGroup,
		ItemTitle
	} from '#lib/ui/item/index.js';
	import { NEW_TAB, PRIVACY_URL, TERMS_URL } from '#lib/ui/legal.js';
	import { Section, sectionClass } from '#lib/ui/section/index.js';

	/** The settings pages under Profile. */
	type SettingsPath = (typeof ROUTES)['twoFactor' | 'profilePrivacy' | 'profileData'];

	// The name other players see, as the backend sent it. Nothing until it is known.
	const name = $derived(myCode.status === 'ready' ? myCode.displayName : null);

	// What the two-factor row says, from the account state the layout reads. Nothing while unknown.
	const twoFactor = $derived(
		session.mfaEnrolled === true ? 'On' : session.mfaEnrolled === false ? 'Off' : null
	);
</script>

<svelte:head>
	<title>Profile · OPEN Pickleball</title>
</svelte:head>

<!-- A row that opens a settings page, with a chevron. -->
{#snippet pageRow(path: SettingsPath, title: string, description: string | null)}
	<li>
		<Item>
			{#snippet child({ props })}
				<a href={resolve(path)} {...props}>
					<ItemContent>
						<ItemTitle>{title}</ItemTitle>
						{#if description}<ItemDescription>{description}</ItemDescription>{/if}
					</ItemContent>
					<ItemActions><ChevronRightIcon aria-hidden="true" /></ItemActions>
				</a>
			{/snippet}
		</Item>
	</li>
{/snippet}

<!-- A row that opens an openpb.org page in a new tab, as the footer links do. -->
{#snippet externalRow(href: string, title: string)}
	<li>
		<Item>
			{#snippet child({ props })}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- off-site openpb.org pages, resolve() is for app routes -->
				<a {href} target="_blank" rel="noopener" {...props}>
					<ItemContent>
						<ItemTitle>{title}<span class="sr-only">{NEW_TAB}</span></ItemTitle>
					</ItemContent>
					<ItemActions><ExternalLinkIcon aria-hidden="true" /></ItemActions>
				</a>
			{/snippet}
		</Item>
	</li>
{/snippet}

<!-- The settings page: the code line, then Account, Privacy, Your data, Help and about, Sign out. -->
<ProfileView>
	{#if session.isSignedIn}
		<Section title="Account">
			<!-- The organizer callout sits above the rows, next to the two-factor row it is about. -->
			<OrganizerMfaPrompt class="mb-8" />
			<ItemGroup>
				<!-- The name comes from sign-up and can't be changed, so it is text, not a link. -->
				{#if name}
					<li data-testid="profile-name">
						<Item>
							<ItemContent>
								<ItemTitle>Name</ItemTitle>
								<span class="text-base wrap-anywhere">{name}</span>
								<ItemDescription>From your sign-up. It can't be changed.</ItemDescription>
							</ItemContent>
						</Item>
					</li>
				{/if}
				{@render pageRow(ROUTES.twoFactor, 'Two-factor authentication', twoFactor)}
			</ItemGroup>
		</Section>

		<Section title="Privacy">
			<ItemGroup>
				{@render pageRow(ROUTES.profilePrivacy, 'Profile visibility', 'What other players can see')}
			</ItemGroup>
		</Section>

		<Section title="Your data">
			<ItemGroup>
				{@render pageRow(
					ROUTES.profileData,
					'Copy of your data',
					'How to get a copy of what OPEN holds'
				)}
			</ItemGroup>
		</Section>

		<Section title="Help and about">
			<ItemGroup>
				<li>
					<!-- From 1024px the side nav foot has Send feedback too. -->
					<FeedbackButton>
						{#snippet trigger({ props })}
							<Item class="cursor-pointer">
								{#snippet child({ props: rowProps })}
									<button {...props} {...rowProps}>
										<ItemContent>
											<ItemTitle>Send feedback</ItemTitle>
											<ItemDescription>Tell us what works and what doesn't</ItemDescription>
										</ItemContent>
										<ItemActions><ChevronRightIcon aria-hidden="true" /></ItemActions>
									</button>
								{/snippet}
							</Item>
						{/snippet}
					</FeedbackButton>
				</li>
				{@render externalRow(TERMS_URL, 'Terms of Service')}
				{@render externalRow(PRIVACY_URL, 'Privacy Policy')}
				<li>
					<Item>
						<ItemContent>
							<ItemTitle>App version</ItemTitle>
						</ItemContent>
						<ItemActions class="text-base" data-testid="app-version">
							{versionLabel(APP_VERSION, APP_COMMIT)}
						</ItemActions>
					</Item>
				</li>
			</ItemGroup>
		</Section>

		<!-- From 1024px the side nav foot has Sign out, so it is not shown twice. -->
		<div class={[sectionClass, 'lg:hidden']}>
			<SignOutButton />
		</div>
	{/if}
</ProfileView>
