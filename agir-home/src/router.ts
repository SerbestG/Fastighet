import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
let depth = 0;
const notify = () => subs.forEach((f) => f());
window.addEventListener('popstate', notify);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type VT = { startViewTransition?: (cb: () => void) => unknown };

/** Navigerar med en mjuk övertoning där webbläsaren stödjer det. */
export function go(path: string, opts: { replace?: boolean; back?: boolean } = {}) {
  if (path === location.pathname + location.search) return;
  const run = () => {
    if (opts.replace) history.replaceState({}, '', path);
    else { history.pushState({}, '', path); depth++; }
    notify();
    window.scrollTo(0, 0);
  };
  const doc = document as unknown as VT;
  document.documentElement.dataset.nav = opts.back ? 'back' : 'fwd';
  if (doc.startViewTransition && !reduced()) doc.startViewTransition(run);
  else run();
}

export function back(fallback = '/') {
  if (depth > 0) {
    depth--;
    document.documentElement.dataset.nav = 'back';
    const doc = document as unknown as VT;
    if (doc.startViewTransition && !reduced()) doc.startViewTransition(() => new Promise<void>((res) => { addEventListener('popstate', () => res(), { once: true }); history.back(); }));
    else history.back();
  } else go(fallback, { back: true, replace: true });
}

export function usePath() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => location.pathname);
}
