// Lokal lagring kan saknas eller vara blockerad (privat läge, förhandsvisningar).
// Prototypen ska fungera ändå, så alla anrop är skyddade.

export function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Inget att göra – lagringen är inte tillgänglig.
  }
}
