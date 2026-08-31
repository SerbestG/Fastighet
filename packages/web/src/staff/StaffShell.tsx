import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import {
  BuildingIcon,
  ChartIcon,
  ClipboardIcon,
  DocumentIcon,
  InvoiceIcon,
  LinkIcon,
  LogoutIcon,
  MegaphoneIcon,
  MenuIcon,
  MessageIcon,
  SettingsIcon,
  ShieldIcon,
  ToolboxIcon,
  UserIcon,
  WrenchIcon,
  CalendarIcon,
} from '../components/icons.js';
import { DashboardPage } from './DashboardPage.js';
import { CaseInboxPage } from './CaseInboxPage.js';
import { StaffCaseDetailPage } from './StaffCaseDetailPage.js';
import { NoticesAdminPage } from './NoticesAdminPage.js';
import { PropertiesPage } from './PropertiesPage.js';
import { ResidentsPage } from './ResidentsPage.js';
import { BookingsAdminPage } from './BookingsAdminPage.js';
import { MessagesAdminPage } from './MessagesAdminPage.js';
import { WorkOrdersAdminPage } from './WorkOrdersAdminPage.js';
import { SurveysAdminPage } from './SurveysAdminPage.js';
import { UsersPage } from './UsersPage.js';
import { IntegrationsPage } from './IntegrationsPage.js';
import { SettingsPage } from './SettingsPage.js';
import { AuditPage } from './AuditPage.js';
import { InvoicesAdminPage } from './InvoicesAdminPage.js';

/**
 * Personalens arbetsyta.
 *
 * Navigationen ligger fast till vänster på skärmar som rymmer den, så att
 * handläggaren kan hoppa mellan ärenden, fastigheter och utskick utan att tappa
 * sammanhanget. På mindre skärmar fälls den ut.
 */
export function StaffShell() {
  const { t } = useI18n();
  const { me, can, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const counts = useQuery<{ kpis: { key: string; value: number }[]; unreadThreads: number }>(
    can('analytics:read') ? '/api/staff/dashboard' : null,
  );

  const openCases = counts.data?.kpis.find((kpi) => kpi.key === 'open')?.value;
  const unread = counts.data?.unreadThreads;

  const nav = [
    { to: '/', label: t('staff.dashboard'), icon: <ChartIcon size={18} />, show: can('analytics:read'), end: true },
    { to: '/arenden', label: t('staff.inbox'), icon: <WrenchIcon size={18} />, show: can('case:read'), count: openCases },
    { to: '/arbetsorder', label: t('contractor.workOrders'), icon: <ToolboxIcon size={18} />, show: can('workorder:read') },
    { to: '/meddelanden', label: t('staff.messages'), icon: <MessageIcon size={18} />, show: can('message:read'), count: unread },
    { to: '/utskick', label: t('staff.notices'), icon: <MegaphoneIcon size={18} />, show: can('notice:read') },
    { to: '/bokningar', label: t('staff.bookings'), icon: <CalendarIcon size={18} />, show: can('booking:read') },
    { to: '/fastigheter', label: t('staff.properties'), icon: <BuildingIcon size={18} />, show: can('property:read') },
    { to: '/hyresgaster', label: t('staff.residents'), icon: <UserIcon size={18} />, show: can('resident:read') },
    { to: '/avier', label: t('nav.invoices'), icon: <InvoiceIcon size={18} />, show: can('invoice:read') },
    { to: '/enkater', label: t('staff.surveys'), icon: <ClipboardIcon size={18} />, show: can('survey:read') },
  ].filter((item) => item.show);

  const adminNav = [
    { to: '/anvandare', label: t('staff.users'), icon: <UserIcon size={18} />, show: can('user:read') },
    { to: '/integrationer', label: t('staff.integrations'), icon: <LinkIcon size={18} />, show: can('integration:read') },
    { to: '/sakerhetslogg', label: t('staff.audit'), icon: <ShieldIcon size={18} />, show: can('audit:read') },
    { to: '/installningar', label: t('staff.settings'), icon: <SettingsIcon size={18} />, show: can('org:settings') },
  ].filter((item) => item.show);

  const sidebar = (
    <aside className="staff-sidebar" style={menuOpen ? { display: 'flex' } : undefined}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          {(me?.organisation.display_name ?? 'H').slice(0, 1)}
        </span>
        <span>
          <span className="brand-name" style={{ display: 'block' }}>
            {me?.organisation.display_name}
          </span>
          <span className="brand-role">
            {me?.user.first_name} {me?.user.last_name}
          </span>
        </span>
      </div>

      <nav className="staff-nav" aria-label="Huvudmeny">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>
            {item.icon}
            <span className="grow">{item.label}</span>
            {item.count !== undefined && item.count > 0 ? <span className="count">{item.count}</span> : null}
          </NavLink>
        ))}
      </nav>

      {adminNav.length ? (
        <>
          <div className="section-title staff-nav-group" style={{ paddingLeft: 'var(--space-3)' }}>
            Administration
          </div>
          <nav className="staff-nav" aria-label="Administration">
            {adminNav.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}>
                {item.icon}
                <span className="grow">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </>
      ) : null}

      <div className="grow" />
      <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
        <LogoutIcon size={18} /> {t('common.logout')}
      </button>
    </aside>
  );

  return (
    <div className="staff-shell">
      <a className="skip-link" href="#huvudinnehall">
        {t('common.skipToContent')}
      </a>

      <div className="staff-topbar">
        <button type="button" className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Meny" aria-expanded={menuOpen}>
          <MenuIcon />
        </button>
        <strong className="grow">{me?.organisation.display_name}</strong>
      </div>

      {sidebar}

      <main id="huvudinnehall" className="staff-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/arenden" element={<CaseInboxPage />} />
          <Route path="/arenden/:id" element={<StaffCaseDetailPage />} />
          <Route path="/arbetsorder" element={<WorkOrdersAdminPage />} />
          <Route path="/meddelanden" element={<MessagesAdminPage />} />
          <Route path="/utskick" element={<NoticesAdminPage />} />
          <Route path="/bokningar" element={<BookingsAdminPage />} />
          <Route path="/fastigheter" element={<PropertiesPage />} />
          <Route path="/hyresgaster" element={<ResidentsPage />} />
          <Route path="/avier" element={<InvoicesAdminPage />} />
          <Route path="/enkater" element={<SurveysAdminPage />} />
          <Route path="/anvandare" element={<UsersPage />} />
          <Route path="/integrationer" element={<IntegrationsPage />} />
          <Route path="/sakerhetslogg" element={<AuditPage />} />
          <Route path="/installningar" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export { DocumentIcon };
