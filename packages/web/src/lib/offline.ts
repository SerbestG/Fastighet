/**
 * Registrering av servicearbetaren och bevakning av uppkopplingen.
 *
 * Servicearbetaren registreras bara i byggd version. Under utveckling skulle en
 * cachad version annars ligga kvar och dölja ändringar.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registreringen är en förbättring, inte ett krav för att appen ska fungera.
    });
  });
}

/** Kallar tillbaka när uppkopplingen ändras. Returnerar en avregistrerare. */
export function watchConnection(onChange: (online: boolean) => void): () => void {
  const update = () => onChange(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}
