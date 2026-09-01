import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { AuthProvider } from './lib/auth.js';
import { I18nProvider } from './lib/i18n.js';
import { ToastProvider } from './lib/toast.js';
import { registerServiceWorker } from './lib/offline.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/app.css';
import './styles/staff.css';

const container = document.getElementById('root');
if (!container) throw new Error('Rotelementet saknas.');

// Gör appen startbar på en svag uppkoppling. Inga uppgifter cachas.
registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
