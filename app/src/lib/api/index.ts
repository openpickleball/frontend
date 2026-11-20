import type { Client } from 'openapi-fetch';
import { createApi } from './client';
import type { paths as ProvisionalPaths } from './provisional';

export { createApi, allauthParams, ALLAUTH_CLIENT, type Api } from './client';
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf';
export { toAppError, isAppError, isCsrfFailure } from './errors';
export type { AppError, AppErrorKind, AllauthFlow } from './errors';
export { unwrap } from './unwrap';
export type { components as OpenComponents, paths as OpenPaths } from './generated/open';
export type { components as AllauthComponents, paths as AllauthPaths } from './generated/allauth';

/** The app-wide clients, same-origin. */
export const api = createApi();

/**
 * The open client typed by the hand-written `provisional.ts` paths, for endpoints the backend
 * does not have yet. Same client, same CSRF and error handling, only the types differ. This is the
 * one place that cast lives. The cast compiles against any shape, so delete this export with
 * `provisional.ts` (see the README) rather than leave it behind.
 */
export const provisionalApi = api.open as unknown as Client<ProvisionalPaths>;
