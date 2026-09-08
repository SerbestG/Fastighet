import { request } from './api.js';

/**
 * Registrering av användning (krav A.3.14).
 *
 * Klienten samlar händelser och skickar dem i klump, så att statistiken inte
 * kostar ett anrop per klick. Servern lagrar ingen användaridentitet, utan en
 * pseudonym som byts varje dygn.
 */

type Kind = 'menu' | 'view' | 'notice';

const queue: { kind: Kind; key: string }[] = [];
// Samma nyckel registreras en gång per besök; servern räknar ändå per dygn.
const seen = new Set<string>();
let timer: number | null = null;

function flush(keepalive = false): void {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  // keepalive låter anropet gå fram även när sidan just stängs. Utan det
  // avbryter webbläsaren anropet och besöket räknas aldrig.
  void request('/api/usage', { method: 'POST', body: { events: batch }, keepalive }).catch(() => {
    // Statistik får aldrig störa användningen. En förlorad klump är oviktig.
  });
}

export function track(kind: Kind, key: string): void {
  const id = `${kind}:${key}`;
  if (seen.has(id)) return;
  seen.add(id);
  queue.push({ kind, key });
  if (timer === null) timer = window.setTimeout(() => flush(), 4000);
}

/** Skickar det som ligger kvar när sidan lämnas. */
export function flushUsage(): void {
  if (timer !== null) window.clearTimeout(timer);
  flush(true);
}
