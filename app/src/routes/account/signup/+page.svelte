<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SignupForm } from '#lib/features/auth/index.js';
</script>

<svelte:head>
	<title>Create account · OPEN Pickleball</title>
</svelte:head>

<div class="max-w-[420px] pt-4">
	<SignupForm onsuccess={() => void goto(resolve('/'))} />
</div>
