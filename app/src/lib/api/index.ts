import { createApi } from './client';

export { createApi, allauthParams, ALLAUTH_CLIENT, type Api } from './client';
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf';
export { toAppError, isAppError, isCsrfFailure } from './errors';
export type { AppError, AppErrorKind, AllauthFlow } from './errors';
export { unwrap } from './unwrap';
export type { components as OpenComponents, paths as OpenPaths } from './generated/open';
export type { components as AllauthComponents, paths as AllauthPaths } from './generated/allauth';

/** The app-wide clients, same-origin. */
export const api = createApi();
