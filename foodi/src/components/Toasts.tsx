import { CircleCheck, CircleAlert, X } from 'lucide-react';
import { dismissToast, useToasts } from '../store/toast';

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.tone === 'success' && <CircleCheck size={18} />}
          {t.tone === 'error' && <CircleAlert size={18} />}
          <span className="toast__text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action?.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast__close" onClick={() => dismissToast(t.id)} aria-label="Stäng meddelandet">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
