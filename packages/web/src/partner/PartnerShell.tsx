import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { LogoutIcon } from '../components/icons.js';
import { WorkOrdersPage } from './WorkOrdersPage.js';

/**
 * Entreprenörsportalen.
 *
 * Ett medvetet smalt gränssnitt: entreprenören ser bara sina egna arbetsorder
 * och de uppgifter som krävs för att utföra dem.
 */
export function PartnerShell() {
  const { t } = useI18n();
  const { me, signOut } = useAuth();

  return (
    <div className="resident-shell" style={{ paddingBottom: 0 }}>
      <a className="skip-link" href="#huvudinnehall">
        {t('common.skipToContent')}
      </a>

      <header className="app-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            {(me?.organisation.display_name ?? 'H').slice(0, 1)}
          </span>
          <span>
            <span style={{ display: 'block' }}>{me?.organisation.display_name}</span>
            <span className="xs subtle">Entreprenörsportal</span>
          </span>
        </span>
        <div className="grow" />
        <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label={t('common.logout')}>
          <LogoutIcon />
        </button>
      </header>

      <main id="huvudinnehall" className="grow">
        <Routes>
          <Route path="/" element={<WorkOrdersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
