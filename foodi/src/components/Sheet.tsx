import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let openSheets = 0;

/**
 * Ark som glider upp underifrån på mobilen och blir en centrerad dialog på
 * större skärmar. Stängs med Esc, bakgrunden eller stängknappen.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  children,
  footer,
  size = 'md',
  className = '',
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Utan standardhuvud, för ark med egen bild överst. */
  bare?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    openSheets += 1;
    document.documentElement.classList.add('has-sheet');
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
      target?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      openSheets -= 1;
      if (openSheets === 0) document.documentElement.classList.remove('has-sheet');
      previous?.focus?.({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className={`sheet-root${closing ? ' is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`sheet sheet--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span className="sheet__grip" aria-hidden="true" />
        {bare ? (
          <h2 id={titleId} className="visually-hidden">
            {title}
          </h2>
        ) : (
          <div className={`sheet__header${hideTitle ? ' sheet__header--bare' : ''}`}>
            <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'sheet__title'}>
              {title}
            </h2>
            <button type="button" className="icon-btn icon-btn--sm sheet__close" onClick={onClose} aria-label="Stäng">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Bekräftelsedialog byggd i sidan (webbläsarens confirm() fungerar inte överallt). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Avbryt',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title} size="sm">
      <div className="confirm">
        <div className="confirm__message">{message}</div>
        <div className="confirm__actions">
          <button type="button" className="btn btn--outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            data-autofocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
