<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { AppErrorKind } from '#lib/api/index.js';
	import { EVENT_KIND_LABELS, ROUTES, type OrganizerEvent } from '#lib/domain/index.js';
	import { OrganizerMfaPrompt, session } from '#lib/features/auth/index.js';
	import { formatDate, rangeLabel } from '#lib/features/matches/index.js';
	import { Alert, AlertAction, AlertTitle } from '#lib/ui/alert/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '#lib/ui/empty/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import {
		BACK_TO_NEWEST,
		LIST_EMPTY_TEXT,
		LIST_EMPTY_TITLE,
		LIST_ERROR,
		LIST_LABEL,
		NEW_EVENT,
		PAST_THE_END_TITLE,
		TWO_FACTOR_LINK,
		waitingForVerification
	} from '../copy.js';
	import { EVENTS_PAGE_SIZE, listOrganizerEvents } from '../services.js';
	import DeleteEventDialog from './delete-event-dialog.svelte';
	import EventDialog from './event-dialog.svelte';

	/**
	 * The organizer area: the account's Events, 20 at a time, with create, change and delete.
	 * Display only: the backend decides who may do what, and its answers are shown as they come.
	 * `page` is 1 for the newest Events, from `?page=` in the address.
	 */
	let { page = 1 }: { page?: number } = $props();

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let items = $state<OrganizerEvent[]>([]);
	let count = $state(0);
	let offset = $state(0);
	let errorKind = $state<AppErrorKind | null>(null);
	let reads = 0;

	async function load(from: number) {
		const mine = ++reads;
		status = 'loading';
		try {
			const result = await listOrganizerEvents(from);
			if (mine !== reads) return;
			items = result.items;
			count = result.count;
			offset = from;
			status = 'ready';
		} catch (error) {
			if (mine !== reads) return;
			errorKind =
				typeof error === 'object' && error !== null && 'kind' in error
					? (error.kind as AppErrorKind)
					: null;
			status = 'error';
		}
	}

	/** The offset of the page in the address, which the last good read may not have reached. */
	const pageOffset = () => (page - 1) * EVENTS_PAGE_SIZE;

	$effect(() => {
		const from = pageOffset();
		untrack(() => void load(from));
	});

	const memberships = $derived(session.organizers ?? []);
	const waiting = $derived(memberships.filter((m) => !m.verified));
	const canCreate = $derived(memberships.some((m) => m.verified));
	const organizerName = (code: string) =>
		memberships.find((m) => m.organizer === code)?.name ?? code;
	const dates = (event: OrganizerEvent) =>
		event.startDate === event.endDate
			? formatDate(event.startDate)
			: `${formatDate(event.startDate)} to ${formatDate(event.endDate)}`;

	const pageHref = (target: number) => `${resolve(ROUTES.organizer)}?page=${target}`;
	const current = $derived(Math.floor(offset / EVENTS_PAGE_SIZE) + 1);
	const hasNewer = $derived(offset > 0);
	const hasOlder = $derived(offset + items.length < count);

	let editing = $state<OrganizerEvent | null>(null);
	let dialogOpen = $state(false);
	let deleting = $state<OrganizerEvent | null>(null);
	let deleteOpen = $state(false);

	function openNew() {
		editing = null;
		dialogOpen = true;
	}

	function openEdit(event: OrganizerEvent) {
		editing = event;
		dialogOpen = true;
	}

	function openDelete(event: OrganizerEvent) {
		deleting = event;
		deleteOpen = true;
	}

	/**
	 * A new Event can belong on any page, and moves the others along, so the page is read again.
	 * An edit replaces its row, if it is on this page.
	 */
	function saved(event: OrganizerEvent) {
		if (editing?.code !== event.code) {
			void load(pageOffset());
			return;
		}
		// An Event no longer on this page stays where it is: nothing to replace here.
		const at = items.findIndex((e) => e.code === event.code);
		if (at >= 0) items[at] = event;
	}

	/** A delete moves the next Event up from a later page, so the page is read again. */
	function deleted() {
		void load(pageOffset());
	}

	/** A change or delete got 404: read the list again. The memberships were read again too. */
	function gone() {
		void load(pageOffset());
	}
</script>

{#if waiting.length > 0 || session.mfaEnrolled === false}
	<div class="mt-8 grid gap-4">
		{#each waiting as membership (membership.organizer)}
			<Alert>
				<ClockIcon aria-hidden="true" />
				<AlertTitle>{waitingForVerification(membership.name)}</AlertTitle>
			</Alert>
		{/each}
		{#if session.mfaEnrolled === false}
			<OrganizerMfaPrompt />
			<Button
				variant="outline"
				size="sm"
				class="justify-self-start"
				href={resolve(ROUTES.twoFactor)}
			>
				{TWO_FACTOR_LINK}
			</Button>
		{/if}
	</div>
{/if}

{#if canCreate}
	<div class="mt-8">
		<Button onclick={openNew}>
			<PlusIcon aria-hidden="true" />
			{NEW_EVENT}
		</Button>
	</div>
{/if}

{#if status === 'error'}
	<Alert variant="destructive" class="mt-8">
		<CircleAlertIcon aria-hidden="true" />
		<AlertTitle>{LIST_ERROR}</AlertTitle>
		<AlertAction>
			<Button variant="outline" size="sm" onclick={() => load(pageOffset())}>Try again</Button>
		</AlertAction>
	</Alert>
	{#if errorKind === 'network'}
		<p class="mt-2 max-w-md text-base text-muted">Check your connection, then try again.</p>
	{/if}
{:else if status === 'loading'}
	<LoadingState label="Loading your Events…" variant="line" class="mt-8" />
{:else if count === 0}
	<Empty class="mt-8">
		<EmptyHeader>
			<EmptyTitle>{LIST_EMPTY_TITLE}</EmptyTitle>
			<EmptyDescription>{LIST_EMPTY_TEXT}</EmptyDescription>
		</EmptyHeader>
	</Empty>
{:else if items.length === 0}
	<!-- A page past the end, such as an old link or the last row of a later page deleted. -->
	<Empty class="mt-8">
		<EmptyHeader>
			<EmptyTitle>{PAST_THE_END_TITLE}</EmptyTitle>
		</EmptyHeader>
		<EmptyContent>
			<Button href={pageHref(1)} variant="outline">{BACK_TO_NEWEST}</Button>
		</EmptyContent>
	</Empty>
{:else}
	<section class="mt-8" aria-label="Page {current} of {Math.ceil(count / EVENTS_PAGE_SIZE)}">
		<ul class="grid border-y border-line" aria-label={LIST_LABEL}>
			{#each items as event (event.code)}
				<li class="grid gap-2 border-t border-line py-4 first:border-t-0">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<span class="text-base font-semibold text-secondary">{event.name}</span>
						<Badge>{EVENT_KIND_LABELS[event.kind]}</Badge>
					</div>
					<p class="text-base text-muted">
						{organizerName(event.organizer)} · {dates(event)}
					</p>
					<div class="flex flex-wrap gap-3">
						<Button
							variant="outline"
							size="sm"
							aria-label="Edit {event.name}"
							onclick={() => openEdit(event)}
						>
							Edit
						</Button>
						<Button
							variant="destructive"
							size="sm"
							aria-label="Delete {event.name}"
							onclick={() => openDelete(event)}
						>
							Delete
						</Button>
					</div>
				</li>
			{/each}
		</ul>
		<nav class="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
			<span class="text-base text-muted" data-testid="range">
				{rangeLabel(offset, items.length, count)}
			</span>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" href={pageHref(current - 1)} disabled={!hasNewer}>
					Newer
				</Button>
				<Button variant="outline" size="sm" href={pageHref(current + 1)} disabled={!hasOlder}>
					Older
				</Button>
			</div>
		</nav>
	</section>
{/if}

<EventDialog bind:open={dialogOpen} event={editing} onsaved={saved} ongone={gone} />
<DeleteEventDialog bind:open={deleteOpen} event={deleting} ondeleted={deleted} ongone={gone} />
