import { api } from './api.js';

/**
 * Prenumeration på pushnotiser (krav B.1.5, B.1.7).
 *
 * Webbläsaren skapar en prenumeration mot sin egen push-tjänst och ger oss en
 * publik nyckel. Innehållet krypteras mot den nyckeln, så push-tjänsten kan
 * aldrig läsa notisen. Användaren styr själv om prenumerationen ska finnas.
 */

export type PushState =
  | 'unsupported'
  | 'unavailable'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Vilken publik nyckel servern använder, eller null när push är avstängt. */
async function publicKey(): Promise<string | null> {
  const result = await api.get<{ publicKey: string | null }>('/api/push/public-key');
  return result.publicKey;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!(await publicKey())) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? 'subscribed' : 'unsubscribed';
}

/** Frågar om lov och registrerar enheten. Returnerar det nya läget. */
export async function subscribeToPush(deviceLabel?: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await publicKey();
  if (!key) return 'unavailable';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed';

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBuffer(key),
    }));

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'unsubscribed';

  await api.post('/api/me/push-subscriptions', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    deviceLabel: deviceLabel ?? deviceName(),
  });
  return 'subscribed';
}

/** Tar bort prenumerationen både i webbläsaren och hos tjänsten. */
export async function unsubscribeFromPush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // Bara den här enheten tas bort; användarens övriga enheter berörs inte.
    await api.post('/api/me/push-subscriptions/remove', { endpoint });
  }
  return 'unsubscribed';
}

/** Ett igenkännbart namn på enheten, utan att avslöja mer än nödvändigt. */
function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return 'iPhone';
  if (/iPad/.test(agent)) return 'iPad';
  if (/Android/.test(agent)) return 'Android';
  if (/Macintosh/.test(agent)) return 'Mac';
  if (/Windows/.test(agent)) return 'Windows';
  return 'Den här enheten';
}
