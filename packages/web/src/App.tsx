import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingBlock } from './components/ui.js';
import { useAuth } from './lib/auth.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { VerifyEmailPage } from './pages/VerifyEmailPage.js';
import { ResidentShell } from './resident/ResidentShell.js';
import { StaffShell } from './staff/StaffShell.js';
import { PartnerShell } from './partner/PartnerShell.js';

/**
 * Rotnivå: väljer rätt skal utifrån vilken roll som är inloggad.
 * Hyresgäst, personal och entreprenör har helt skilda gränssnitt.
 */
export function App() {
  const { me, loading, signedIn } = useAuth();

  if (loading) {
    return (
      <div className="page" aria-busy="true">
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Routes>
        <Route path="/logga-in" element={<LoginPage />} />
        <Route path="/skapa-konto" element={<RegisterPage />} />
        <Route path="/bekrafta-epost" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/logga-in" replace />} />
      </Routes>
    );
  }

  const surface = me?.user.surface ?? 'resident';
  if (surface === 'staff') return <StaffShell />;
  if (surface === 'contractor') return <PartnerShell />;
  return <ResidentShell />;
}
