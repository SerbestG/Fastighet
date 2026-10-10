import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  const item: Toast = { id: nextId++, message, tone: options.tone ?? 'default', action: options.action };
  toasts = [...toasts.slice(-1), item];
  emit();
  window.setTimeout(() => dismissToast(item.id), options.action ? 5000 : 3200);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}
