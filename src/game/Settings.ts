/** Player settings. The settings screen arrives in phase 10; these defaults apply until then. */
export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  leftHanded: boolean;
}

const KEY = 'doodle-bridge.settings';

function defaults(): Settings {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { sound: true, music: true, haptics: true, reducedMotion: reduced, leftHanded: false };
}

let current: Settings | null = null;

export function settings(): Settings {
  if (current) return current;
  current = defaults();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) current = { ...current, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage unavailable: keep defaults.
  }
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...settings(), ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Ignore: settings still apply for this session.
  }
}

/** Short vibration where supported and enabled. */
export function buzz(ms: number): void {
  if (!settings().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported.
  }
}
