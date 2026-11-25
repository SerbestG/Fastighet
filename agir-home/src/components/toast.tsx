import { useSyncExternalStore } from 'react';

let current: { id: number; text: string } | null = null;
const subs = new Set<() => void>();
let timer: number | undefined;

export function toast(text: string) {
  current = { id: Date.now(), text };
  subs.forEach((f) => f());
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { current = null; subs.forEach((f) => f()); }, 2600);
}

export function Toaster() {
  const t = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  return (
    <div className="toast-yta" aria-live="polite">
      {t && <div key={t.id} className="toast">{t.text}</div>}
    </div>
  );
}
