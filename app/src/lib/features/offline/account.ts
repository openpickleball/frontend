/**
 * The key a queue is stored under: the SHA-256 of the account's email, trimmed and in lower case,
 * as hex. The email itself is never written to the device. The browser client gets no stable
 * account id from the backend, so the email is what tells two accounts apart.
 */
export async function accountKey(email: string): Promise<string> {
	const bytes = new TextEncoder().encode(email.trim().toLowerCase());
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
	return `v1:${hex}`;
}
