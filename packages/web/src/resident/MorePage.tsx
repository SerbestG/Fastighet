import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import {
  AlertIcon,
  BoxIcon,
  ChevronRight,
  ClipboardIcon,
  DocumentIcon,
  InvoiceIcon,
  KeyIcon,
  LeafIcon,
  MessageIcon,
  PhoneIcon,
  UserIcon,
} from '../components/icons.js';

/** Samlar det som inte får plats i flikraden, i stället för att korta ned namnen. */
export function MorePage() {
  const { t } = useI18n();
  const { feature, signOut, me } = useAuth();

  const items = [
    { to: '/driftinfo', label: t('nav.notices'), icon: <AlertIcon size={18} />, enabled: feature('notices') },
    { to: '/meddelanden', label: t('nav.messages'), icon: <MessageIcon size={18} />, enabled: feature('messages') },
    { to: '/avier', label: t('nav.invoices'), icon: <InvoiceIcon size={18} />, enabled: feature('invoices') },
    { to: '/dokument', label: t('nav.documents'), icon: <DocumentIcon size={18} />, enabled: feature('documents') },
    { to: '/flytt', label: t('nav.moving'), icon: <BoxIcon size={18} />, enabled: feature('moving') },
    { to: '/enkater', label: t('nav.surveys'), icon: <ClipboardIcon size={18} />, enabled: feature('surveys') },
    { to: '/omradet', label: t('nav.area'), icon: <LeafIcon size={18} />, enabled: feature('area') },
    { to: '/nycklar', label: 'Nycklar och passage', icon: <KeyIcon size={18} />, enabled: feature('access') },
    { to: '/kontakt', label: t('nav.contact'), icon: <PhoneIcon size={18} />, enabled: true },
    { to: '/profil', label: t('nav.profile'), icon: <UserIcon size={18} />, enabled: true },
  ].filter((item) => item.enabled);

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('nav.more')}</h1>
      </header>

      <div className="card card-flush">
        {items.map((item) => (
          <Link className="list-item" to={item.to} key={item.to}>
            {item.icon}
            <span className="grow list-title">{item.label}</span>
            <ChevronRight size={18} className="chevron" />
          </Link>
        ))}
      </div>

      <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>
        {t('common.logout')}
      </button>

      <p className="xs subtle center">
        {me?.organisation.display_name} · {t('common.appName')} 1.0
      </p>
    </div>
  );
}
