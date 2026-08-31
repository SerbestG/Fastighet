import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { BellIcon, CalendarIcon, HomeIcon, MenuIcon, UserIcon, WrenchIcon } from '../components/icons.js';
import { HomePage } from './HomePage.js';
import { CasesPage } from './CasesPage.js';
import { NewCasePage } from './NewCasePage.js';
import { CaseDetailPage } from './CaseDetailPage.js';
import { BookingPage } from './BookingPage.js';
import { ResourcePage } from './ResourcePage.js';
import { InvoicesPage } from './InvoicesPage.js';
import { DocumentsPage } from './DocumentsPage.js';
import { MyHomePage } from './MyHomePage.js';
import { NoticesPage } from './NoticesPage.js';
import { NoticeDetailPage } from './NoticeDetailPage.js';
import { MessagesPage } from './MessagesPage.js';
import { ThreadPage } from './ThreadPage.js';
import { MovingPage } from './MovingPage.js';
import { SurveysPage } from './SurveysPage.js';
import { ProfilePage } from './ProfilePage.js';
import { AreaPage } from './AreaPage.js';
import { NotificationsPage } from './NotificationsPage.js';
import { MorePage } from './MorePage.js';
import { ContactPage } from './ContactPage.js';
import { AccessPage } from './AccessPage.js';

/**
 * Hyresgästens skal: en fast rubrikrad och en flik-rad längst ned.
 * Navigationen har fem val – det som används oftast ligger direkt åtkomligt och
 * resten samlas under "Mer", i stället för att fylla ytan med allt på en gång.
 */
export function ResidentShell() {
  const { t } = useI18n();
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unread = useQuery<{ unreadCount: number }>('/api/me/notifications?unreadOnly=true&limit=1');

  const organisation = me?.organisation;
  const initials = (organisation?.display_name ?? 'H').slice(0, 1).toUpperCase();
  const unreadCount = unread.data?.unreadCount ?? 0;

  return (
    <div className="resident-shell">
      <a className="skip-link" href="#huvudinnehall">
        {t('common.skipToContent')}
      </a>

      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
        >
          <span className="brand-mark" aria-hidden="true">
            {initials}
          </span>
          <span>{organisation?.display_name ?? t('common.appName')}</span>
        </button>
        <div className="grow" />
        <NavLink to="/notiser" className="icon-btn" aria-label={`${t('profile.notifications')}${unreadCount ? `, ${unreadCount} olästa` : ''}`}>
          <BellIcon />
          {unreadCount > 0 ? <span className="dot">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
        </NavLink>
      </header>

      <main id="huvudinnehall" className="grow" key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/arenden" element={<CasesPage />} />
          <Route path="/arenden/nytt" element={<NewCasePage />} />
          <Route path="/arenden/:id" element={<CaseDetailPage />} />
          <Route path="/boka" element={<BookingPage />} />
          <Route path="/boka/:id" element={<ResourcePage />} />
          <Route path="/avier" element={<InvoicesPage />} />
          <Route path="/dokument" element={<DocumentsPage />} />
          <Route path="/mitt-boende" element={<MyHomePage />} />
          <Route path="/driftinfo" element={<NoticesPage />} />
          <Route path="/driftinfo/:id" element={<NoticeDetailPage />} />
          <Route path="/meddelanden" element={<MessagesPage />} />
          <Route path="/meddelanden/:id" element={<ThreadPage />} />
          <Route path="/flytt" element={<MovingPage />} />
          <Route path="/enkater" element={<SurveysPage />} />
          <Route path="/omradet" element={<AreaPage />} />
          <Route path="/nycklar" element={<AccessPage />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/notiser" element={<NotificationsPage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/mer" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar" aria-label="Huvudmeny">
        <NavLink to="/" end>
          <HomeIcon size={22} />
          {t('nav.home')}
        </NavLink>
        <NavLink to="/arenden">
          <WrenchIcon size={22} />
          {t('nav.cases')}
        </NavLink>
        <NavLink to="/boka">
          <CalendarIcon size={22} />
          {t('nav.booking')}
        </NavLink>
        <NavLink to="/mitt-boende">
          <UserIcon size={22} />
          {t('nav.myHome')}
        </NavLink>
        <NavLink to="/mer">
          <MenuIcon size={22} />
          {t('nav.more')}
        </NavLink>
      </nav>
    </div>
  );
}
