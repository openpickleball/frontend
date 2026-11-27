import { createApi, type Api } from './client';

export { createApi, allauthParams, ALLAUTH_CLIENT, type Api } from './client';
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CSRF_HOST_COOKIE_NAME, readCsrfToken } from './csrf';
export {
	AppError,
	toAppError,
	isAppError,
	isCsrfFailure,
	reauthFlowsOf,
	reauthCodeTypesOf,
	MFA_REQUIRED,
	MFA_REQUIRED_MESSAGE,
	REAUTHENTICATION_REQUIRED
} from './errors';
export type {
	AppErrorFields,
	AppErrorKind,
	AllauthFlow,
	ReauthCodeType,
	ReauthMethod
} from './errors';
export { unwrap } from './unwrap';
export type { components as OpenComponents, paths as OpenPaths } from './generated/open';
export type { components as AllauthComponents, paths as AllauthPaths } from './generated/allauth';

/** The app-wide clients, same-origin. */
export const api = createApi();

/**
 * The one way to swap the client: every service that calls the API takes this option, and uses
 * the app-wide `api` without it. For tests, which need a base URL and a cookie jar in node.
 */
export type ApiOption = { api?: Api };
