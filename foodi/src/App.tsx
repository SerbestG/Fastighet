import { useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { tickAutopilot, useAppState } from './store/store';
import { CartBar, SiteHeader, TabBar } from './components/Layout';
import { Toasts } from './components/Toasts';
import { HomePage } from './pages/customer/HomePage';
import { SearchPage } from './pages/customer/SearchPage';
import { RestaurantPage } from './pages/customer/RestaurantPage';
import { CheckoutPage } from './pages/customer/CheckoutPage';
import { OrderPage } from './pages/customer/OrderPage';
import { OrdersPage } from './pages/customer/OrdersPage';
import { FavoritesPage } from './pages/customer/FavoritesPage';
import { ProfilePage } from './pages/customer/ProfilePage';
import { PartnerPicker, PartnerApp } from './pages/partner/PartnerApp';
import { AdminApp } from './pages/admin/AdminApp';

/** Sidor där bottenmenyn döljs på mobilen för att ge plats åt beställningen. */
const FOCUS_ROUTES = [/^\/r\//, /^\/kassa/, /^\/order\//];

function CustomerShell() {
  const { pathname } = useLocation();
  const focus = FOCUS_ROUTES.some((re) => re.test(pathname));
  const showCartBar = !/^\/kassa/.test(pathname) && !/^\/order\//.test(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className={`shell${focus ? ' shell--focus' : ''}`}>
      <a href="#main" className="skip-link">
        Hoppa till innehållet
      </a>
      <SiteHeader />
      <main id="main" className="shell__main">
        <Outlet />
      </main>
      {showCartBar && <CartBar withTabbar={!focus} />}
      {!focus && <TabBar />}
    </div>
  );
}

function Autopilot() {
  const { settings } = useAppState();
  useEffect(() => {
    if (!settings.autopilot) return;
    const id = window.setInterval(() => tickAutopilot(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [settings.autopilot]);
  return null;
}

export function App() {
  return (
    <HashRouter>
      <Autopilot />
      <Routes>
        <Route element={<CustomerShell />}>
          <Route index element={<HomePage />} />
          <Route path="sok" element={<SearchPage />} />
          <Route path="r/:id" element={<RestaurantPage />} />
          <Route path="kassa" element={<CheckoutPage />} />
          <Route path="order/:id" element={<OrderPage />} />
          <Route path="bestallningar" element={<OrdersPage />} />
          <Route path="favoriter" element={<FavoritesPage />} />
          <Route path="profil" element={<ProfilePage />} />
        </Route>
        <Route path="partner" element={<PartnerPicker />} />
        <Route path="partner/:id/*" element={<PartnerApp />} />
        <Route path="admin/*" element={<AdminApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </HashRouter>
  );
}
