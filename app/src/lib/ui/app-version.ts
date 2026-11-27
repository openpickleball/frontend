/**
 * The build's version and commit. `vite.config.ts` sets both at build time (`define`), so they
 * are never typed by hand. Profile shows them under Help and about.
 */
export const APP_VERSION: string = __APP_VERSION__;

/** The short commit hash the app was built from, or `''` when the build could not tell. */
export const APP_COMMIT: string = __APP_COMMIT__;

/** "0.0.1 (abc1234)", or just the version when the commit is not known. */
export function versionLabel(version: string, commit: string): string {
	return commit ? `${version} (${commit})` : version;
}
