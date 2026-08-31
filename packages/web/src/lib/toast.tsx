import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
  traceId?: string;
}

interface ToastValue {
  show: (message: string, tone?: 'default' | 'error', traceId?: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: 'default' | 'error' = 'default', traceId?: string) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-2), { id, message, tone, traceId }]);
      // Felmeddelanden ligger kvar längre så att spårnings-ID hinner läsas.
      setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Meddelandena annonseras för skärmläsare utan att flytta fokus. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone === 'error' ? ' toast-error' : ''}`}>
            <div className="grow">
              {toast.message}
              {toast.traceId ? <div className="xs" style={{ opacity: 0.75 }}>ID: {toast.traceId}</div> : null}
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Stäng meddelande">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast måste användas inom ToastProvider.');
  return value;
}
