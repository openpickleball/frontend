/**
 * Two-factor settings: TOTP from an authenticator app, and recovery codes (backend ADR 0043).
 * Each call throws an `AppError` when it fails. Turning TOTP on or off and making new codes can
 * fail with a request to reauthenticate first: run them with `withReauth`.
 *
 * How this backend behaves:
 * - `GET account/authenticators/totp` answers 404 with a new setup key while TOTP is off.
 * - Recovery codes are shown once: after that, `GET recovery-codes` leaves `unused_codes` out,
 *   though it still counts them.
 * - Making new codes answers allauth's recovery codes body, which the schema leaves untyped, so
 *   it is checked here.
 */
import { allauthParams, api as appApi, toAppError, type ApiOption } from '#lib/api/index.js';
import { z } from '#lib/domain/zod.js';
import { session } from './session.svelte.js';

type Settled = { data?: unknown; error?: unknown; response: Response };

async function settle(call: Promise<Settled>): Promise<Settled> {
	try {
		return await call;
	} catch (cause) {
		throw toAppError(cause);
	}
}

function fail(result: Settled): never {
	throw toAppError(result.error, result.response);
}

/** TOTP off, with a new setup key and its `otpauth://` link for a QR code, or on. */
export type TotpSetup = { status: 'off'; secret: string; totpUrl: string } | { status: 'on' };

/** What the settings show. Null for a kind the account does not have. */
export type Authenticators = {
	totp: { createdAt: Date } | null;
	recoveryCodes: { total: number; unused: number } | null;
};

/** Recovery codes: the unused ones (empty once shown), and the counts. */
export type RecoveryCodes = { codes: string[]; total: number; unused: number };

const timestamp = z.number().transform((seconds) => new Date(seconds * 1000));

const setupSchema = z.object({ meta: z.object({ secret: z.string(), totp_url: z.string() }) });

const authenticatorsSchema = z.object({
	data: z.array(
		z.object({
			type: z.string(),
			created_at: timestamp,
			total_code_count: z.number().optional(),
			unused_code_count: z.number().optional()
		})
	)
});

const recoveryCodesSchema = z.object({
	data: z.object({
		total_code_count: z.number(),
		unused_code_count: z.number(),
		// Left out altogether once the codes were shown (allauth's `_authenticator_data`).
		unused_codes: z.array(z.string()).default([])
	})
});

/** Parse a body the schema leaves loose. Another shape is a server error. */
function parsed<T>(schema: z.ZodType<T>, body: unknown): T {
	const result = schema.safeParse(body);
	if (result.success) return result.data;
	throw toAppError(new SyntaxError('The two-factor answer has an unexpected shape.'));
}

function toCodes(body: unknown): RecoveryCodes {
	const { data } = parsed(recoveryCodesSchema, body);
	return { codes: data.unused_codes, total: data.total_code_count, unused: data.unused_code_count };
}

/** Is TOTP on? While it is off, a new setup key. Keeps `session.mfaEnrolled` current. */
export async function getTotpSetup({ api = appApi }: ApiOption = {}): Promise<TotpSetup> {
	const result = await settle(
		api.allauth.GET('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams
		})
	);
	if (result.response.status === 200) {
		session.mfaEnrolled = true;
		return { status: 'on' };
	}
	if (result.response.status !== 404) fail(result);
	const { meta } = parsed(setupSchema, result.error);
	session.mfaEnrolled = false;
	return { status: 'off', secret: meta.secret, totpUrl: meta.totp_url };
}

/** What the account has. Keeps `session.mfaEnrolled` current. */
export async function listAuthenticators({
	api = appApi
}: ApiOption = {}): Promise<Authenticators> {
	const result = await settle(
		api.allauth.GET('/_allauth/{client}/v1/account/authenticators', { params: allauthParams })
	);
	if (!result.response.ok) fail(result);
	const { data } = parsed(authenticatorsSchema, result.data);
	const totp = data.find((item) => item.type === 'totp');
	const codes = data.find((item) => item.type === 'recovery_codes');
	session.mfaEnrolled = Boolean(totp);
	return {
		totp: totp ? { createdAt: totp.created_at } : null,
		recoveryCodes: codes
			? { total: codes.total_code_count ?? 0, unused: codes.unused_code_count ?? 0 }
			: null
	};
}

/** Turn TOTP on with the code the app shows for the setup key. A wrong code is on `fields.code`. */
export async function activateTotp(code: string, { api = appApi }: ApiOption = {}): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams,
			body: { code }
		})
	);
	if (!result.response.ok) fail(result);
	session.mfaEnrolled = true;
}

/** Turn TOTP off. The recovery codes go too, and the account's other sessions end. */
export async function deactivateTotp({ api = appApi }: ApiOption = {}): Promise<void> {
	const result = await settle(
		api.allauth.DELETE('/_allauth/{client}/v1/account/authenticators/totp', {
			params: allauthParams
		})
	);
	if (!result.response.ok) fail(result);
	session.mfaEnrolled = false;
}

/** The recovery codes, or null when there are none. The unused codes are listed only once. */
export async function getRecoveryCodes({
	api = appApi
}: ApiOption = {}): Promise<RecoveryCodes | null> {
	const result = await settle(
		api.allauth.GET('/_allauth/{client}/v1/account/authenticators/recovery-codes', {
			params: allauthParams
		})
	);
	if (result.response.status === 404) return null;
	if (!result.response.ok) fail(result);
	return toCodes(result.data);
}

/** Make new recovery codes. The old ones stop working. The answer lists the new ones. */
export async function regenerateRecoveryCodes({
	api = appApi
}: ApiOption = {}): Promise<RecoveryCodes> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/account/authenticators/recovery-codes', {
			params: allauthParams
		})
	);
	if (!result.response.ok) fail(result);
	return toCodes(result.data);
}
