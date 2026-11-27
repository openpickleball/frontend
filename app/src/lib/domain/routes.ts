/**
 * The app's fixed page paths, in one place. Pass them to `resolve()` to build a link, so a
 * renamed route fails `pnpm check`. Pages with a parameter, such as `/matches/[code]`, are
 * written out where they are used, because `resolve()` types them with their parameters.
 */
export const ROUTES = {
	home: '/',
	record: '/record',
	matches: '/matches',
	profile: '/profile',
	twoFactor: '/profile/two-factor',
	ratings: '/ratings',
	organizer: '/organizer',
	account: '/account',
	login: '/account/login',
	signup: '/account/signup',
	passwordReset: '/account/password/reset'
} as const;
