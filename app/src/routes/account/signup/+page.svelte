<script lang="ts">
	import { page } from '$app/state';
	import { SignupForm, goAfterSignIn } from '#lib/features/auth/index.js';
</script>

<SignupForm onsuccess={() => void goAfterSignIn(page.url.searchParams)} />
