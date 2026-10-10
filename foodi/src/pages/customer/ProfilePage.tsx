import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutDashboard, MapPin, RotateCcw, ShieldCheck, Store, Trash2, User } from 'lucide-react';
import { rememberCustomer, resetDemo, useAppState } from '../../store/store';
import { useLocationPoint } from '../../store/hooks';
import { toast } from '../../store/toast';
import { phone } from '../../lib/format';
import { PageHeader } from '../../components/Layout';
import { LocationSheet } from '../../components/Location';
import { ConfirmDialog } from '../../components/Sheet';

export function ProfilePage() {
  const { customer } = useAppState();
  const point = useLocationPoint();
  const [locationOpen, setLocationOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="page-width narrow-page">
      <PageHeader title="Profil" subtitle="Du beställer som gäst – inget konto behövs" sticky={false} />

      <section className="settings-group">
        <h2>Dina uppgifter</h2>
        {customer ? (
          <div className="settings-card">
            <span className="settings-card__icon">
              <User size={20} />
            </span>
            <span className="settings-card__text">
              <strong>{customer.name}</strong>
              <span className="muted">
                {phone(customer.phone)}
                {customer.email ? ` · ${customer.email}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                rememberCustomer(null);
                toast('Dina uppgifter är borttagna från enheten');
              }}
            >
              <Trash2 size={16} aria-hidden="true" /> Glöm
            </button>
          </div>
        ) : (
          <p className="muted settings-group__empty">
            Inga sparade uppgifter. Kryssa i ”Kom ihåg mina uppgifter” i kassan så slipper du skriva dem nästa gång.
          </p>
        )}
        <button type="button" className="settings-card settings-card--link" onClick={() => setLocationOpen(true)}>
          <span className="settings-card__icon">
            <MapPin size={20} />
          </span>
          <span className="settings-card__text">
            <strong>Hämtar nära</strong>
            <span className="muted">{point.label}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      <section className="settings-group">
        <h2>Prototypens andra vyer</h2>
        <Link to="/partner" className="settings-card settings-card--link">
          <span className="settings-card__icon settings-card__icon--lime">
            <Store size={20} />
          </span>
          <span className="settings-card__text">
            <strong>Restaurangvy</strong>
            <span className="muted">Ta emot ordrar, sätt hämttid, hantera meny och öppettider</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/admin" className="settings-card settings-card--link">
          <span className="settings-card__icon settings-card__icon--ink">
            <LayoutDashboard size={20} />
          </span>
          <span className="settings-card__text">
            <strong>Administratör</strong>
            <span className="muted">Restauranger, beställningar, kunder och avgifter</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <section className="settings-group">
        <h2>Om prototypen</h2>
        <div className="about-proto">
          <p>
            <ShieldCheck size={18} aria-hidden="true" /> Det här är en klickbar prototyp. Följande är simulerat:
          </p>
          <ul>
            <li>Betalning med Swish, kort och mobilplånbok – inga pengar dras.</li>
            <li>Sms och e-post – meddelandena visas bara på orderns sida.</li>
            <li>Restaurangens svar – demorestaurangen bekräftar och lagar maten i snabbt tempo.</li>
            <li>Kundomdömen och historik i adminvyn är exempeldata.</li>
          </ul>
          <p className="muted">
            Allt du gör sparas i den här webbläsaren. Öppna restaurangvyn i en annan flik för att se beställningar komma in direkt.
          </p>
        </div>
        <button type="button" className="btn btn--outline" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={16} aria-hidden="true" /> Återställ demodata
        </button>
      </section>

      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
      <ConfirmDialog
        open={confirmReset}
        title="Återställa prototypen?"
        message={<p>Varukorg, beställningar, favoriter och ändringar i menyer tas bort från den här webbläsaren.</p>}
        confirmLabel="Återställ"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          setConfirmReset(false);
          toast('Prototypen är återställd', { tone: 'success' });
        }}
      />
    </div>
  );
}
