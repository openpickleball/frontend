import { isAppError } from '#lib/api/index.js';
import { fetchMySettings, updateMySettings } from './services.js';
import { checkDisplayName } from './settings.js';
import type { MySettings, MySettingsChange, Privacy, PrivacyKey, Visibility } from './types.js';

/**
 * - `idle`: `load()` has not run.
 * - `loading`: asking the backend.
 * - `ready`: `displayName` and `privacy` are set.
 * - `unavailable`: the account has no player yet (a 404), or an older backend has no `me/player`.
 * - `error`: the backend could not be reached.
 */
export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export type SettingsDeps = {
	/** `null` when `me/player` is not available. Throws an `AppError` for other failures. */
	fetchMySettings: () => Promise<MySettings | null>;
	updateMySettings: (change: MySettingsChange) => Promise<MySettings>;
};

export type SaveNameResult = { ok: true; value: string } | { ok: false; message: string };

const FALLBACK = "We couldn't save that. Check your connection and try again.";

function messageOf(error: unknown, field?: string): string {
	if (!isAppError(error)) return FALLBACK;
	const own = field ? error.fields[field]?.[0] : undefined;
	return own ?? error.message;
}

/**
 * The signed-in player's display name and privacy settings, read with `GET me/player` and
 * saved with `PATCH me/player`. The backend decides what the player may change and checks every
 * value. This only shows what it answers.
 */
export class SettingsStore {
	status = $state<SettingsStatus>('idle');
	displayName = $state('');
	privacy = $state<Privacy | null>(null);
	/** Set when a privacy change could not be saved. */
	privacyError = $state<string | null>(null);

	#deps: SettingsDeps;
	#run = 0;
	/** What the backend last said the privacy settings are. */
	#confirmed: Privacy | null = null;
	/** The newest change in flight for each setting. */
	#latest: Partial<Record<PrivacyKey, number>> = {};
	#calls = 0;

	constructor(deps: Partial<SettingsDeps> = {}) {
		this.#deps = {
			fetchMySettings: deps.fetchMySettings ?? fetchMySettings,
			updateMySettings: deps.updateMySettings ?? updateMySettings
		};
	}

	async load(): Promise<void> {
		const run = ++this.#run;
		this.status = 'loading';
		this.privacyError = null;
		try {
			const settings = await this.#deps.fetchMySettings();
			if (run !== this.#run) return;
			if (!settings) {
				this.status = 'unavailable';
				return;
			}
			this.#apply(settings);
			this.status = 'ready';
		} catch {
			if (run === this.#run) this.status = 'error';
		}
	}

	/** Check and save a new display name. The backend's message wins over ours. */
	async saveName(raw: string): Promise<SaveNameResult> {
		const checked = checkDisplayName(raw);
		if (!checked.ok) return checked;
		if (checked.value === this.displayName) return { ok: true, value: checked.value };
		try {
			const settings = await this.#deps.updateMySettings({ displayName: checked.value });
			this.displayName = settings.displayName;
			this.#confirmed = { ...settings.privacy };
			this.#settle();
			return { ok: true, value: settings.displayName };
		} catch (error) {
			return { ok: false, message: messageOf(error, 'display_name') };
		}
	}

	/**
	 * Change who may see one detail. Only that setting is sent. The switch moves at once. When
	 * the backend answers, every switch shows what it holds, except one the player has changed
	 * again since. If the save fails, the switch goes back to what the backend last said.
	 */
	async setVisibility(key: PrivacyKey, visibility: Visibility): Promise<boolean> {
		const privacy = this.privacy;
		const confirmed = this.#confirmed;
		if (!privacy || !confirmed) return false;
		const run = this.#run;
		const call = ++this.#calls;
		this.#latest[key] = call;
		this.privacyError = null;
		this.privacy = { ...privacy, [key]: visibility };
		try {
			const settings = await this.#deps.updateMySettings({ privacy: { [key]: visibility } });
			if (run !== this.#run) return false;
			this.#confirmed = { ...settings.privacy };
			this.displayName = settings.displayName;
			return true;
		} catch (error) {
			if (run !== this.#run) return false;
			if (this.#latest[key] === call) this.privacyError = messageOf(error);
			return false;
		} finally {
			if (this.#latest[key] === call) delete this.#latest[key];
			if (run === this.#run) this.#settle();
		}
	}

	/** Show what the backend holds, except for settings still being saved. */
	#settle(): void {
		const confirmed = this.#confirmed;
		const shown = this.privacy;
		if (!confirmed || !shown) return;
		const next = { ...confirmed };
		for (const key of Object.keys(this.#latest) as PrivacyKey[]) next[key] = shown[key];
		this.privacy = next;
	}

	#apply(settings: MySettings): void {
		this.displayName = settings.displayName;
		this.#confirmed = { ...settings.privacy };
		this.#latest = {};
		this.privacy = { ...settings.privacy };
	}
}
