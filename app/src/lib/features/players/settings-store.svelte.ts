import { isAppError } from '#lib/api/index.js';
import { fetchMySettings, privacyField, updateMySettings } from './services.js';
import type { MySettings, MySettingsChange, Privacy, PrivacyKey } from './types.js';

/**
 * - `idle`: `load()` has not run.
 * - `loading`: asking the backend.
 * - `ready`: `displayName`, `nameLocked` and `privacy` are set.
 * - `unavailable`: `me/player` answered a 404 or 405, so there is no player to read.
 * - `error`: the backend could not be reached.
 */
export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export type SettingsDeps = {
	/** `null` when `me/player` is not available. Throws an `AppError` for other failures. */
	fetchMySettings: () => Promise<MySettings | null>;
	updateMySettings: (change: MySettingsChange) => Promise<MySettings>;
};

const FALLBACK = "We couldn't save that. Check your connection and try again.";

function messageOf(error: unknown, field?: string): string {
	if (!isAppError(error)) return FALLBACK;
	const own = field ? error.fields[field]?.[0] : undefined;
	return own ?? error.message;
}

/**
 * The signed-in player's name and privacy settings, read with `GET me/player` and saved with
 * `PATCH me/player`. The name comes from sign-up and can't be changed: only how it is shown
 * (`privacy.name`). The backend builds the name, decides what the player may change and checks
 * every value. This only shows what it answers.
 */
export class SettingsStore {
	status = $state<SettingsStatus>('idle');
	/** The name other players see, as the backend last sent it. */
	displayName = $state('');
	/** True while the name must stay "First L." (13 to 17). The backend decides. */
	nameLocked = $state(false);
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

	/**
	 * Change one privacy setting: who may see a detail, or how the name is shown. Only that
	 * setting is sent. The switch moves at once. When the backend answers, every switch shows
	 * what it holds, except one the player has changed again since, and the name is the one it
	 * built. If the save fails, the switch goes back to what the backend last said.
	 */
	async setPrivacy<K extends PrivacyKey>(key: K, value: Privacy[K]): Promise<boolean> {
		const privacy = this.privacy;
		const confirmed = this.#confirmed;
		if (!privacy || !confirmed) return false;
		const run = this.#run;
		const call = ++this.#calls;
		this.#latest[key] = call;
		this.privacyError = null;
		this.privacy = { ...privacy, [key]: value };
		try {
			const settings = await this.#deps.updateMySettings({ privacy: { [key]: value } });
			if (run !== this.#run) return false;
			this.#confirmed = { ...settings.privacy };
			this.displayName = settings.displayName;
			this.nameLocked = settings.nameLocked;
			return true;
		} catch (error) {
			if (run !== this.#run) return false;
			if (this.#latest[key] === call) {
				this.privacyError = messageOf(error, `privacy.${privacyField(key)}`);
			}
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
		for (const key of Object.keys(this.#latest) as PrivacyKey[]) {
			Object.assign(next, { [key]: shown[key] });
		}
		this.privacy = next;
	}

	#apply(settings: MySettings): void {
		this.displayName = settings.displayName;
		this.nameLocked = settings.nameLocked;
		this.#confirmed = { ...settings.privacy };
		this.#latest = {};
		this.privacy = { ...settings.privacy };
	}
}
