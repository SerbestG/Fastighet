import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Header, SectionLabel } from '../components/ui';
import { Icon } from '../components/Icon';
import { toast } from '../components/toast';
import { CATALOG, ALL_PRODUCTS } from '../home/catalog';
import { logEvent } from '../state/store';

const FORDELAR: [string, string][] = [
  ['Öppen standard', 'Matter över Thread. Blanda märken, byt aldrig ut allt.'],
  ['Agir, en AI som tänker åt er', 'Släcker det som glömts, säger till när något står på i onödan.'],
  ['Följer elpriset', 'Golvvärme och laddning när elen är billigast.'],
  ['Hela hemmet i en app', 'Ljus, värme, lås, larm, laddbox, kameror och läckage.'],
];

/** Agir-sortimentet med "Boka elektriker". Priserna sätts när sortimentet är klart. */
export function Sortiment() {
  const [valda, setValda] = useState<string[]>([]);
  const [form, setForm] = useState(false);
  const [namn, setNamn] = useState('');
  const [tel, setTel] = useState('');
  const [ort, setOrt] = useState('');
  const toggle = (id: string) => setValda(valda.includes(id) ? valda.filter((x) => x !== id) : [...valda, id]);
  const elektriker = ALL_PRODUCTS.filter((p) => valda.includes(p.id) && p.electrician).length;
  const ok = namn.trim() && tel.trim().length >= 6 && ort.trim();

  const skicka = () => {
    const vad = ALL_PRODUCTS.filter((p) => valda.includes(p.id)).map((p) => p.name).join(', ') || 'Rådgivning';
    logEvent('agir', 'Förfrågan: elektriker', `${namn.trim()} · ${ort.trim()} · ${vad}`);
    toast('Förfrågan sparad. (Demo – den skickas inte än.)');
    setForm(false); setValda([]);
  };

  return (
    <div className="skarm lista-skarm" style={{ paddingBottom: valda.length ? 120 : undefined }}>
      <Header title="Sortimentet" backTo="/installningar" backLabel="Inställningar" status="Matter över Thread · installeras av behörig elektriker" />

      <div className="sortiment-hero in">
        <h2>Allt för ljuset i hemmet. Och lite till.</h2>
        <span className="rad-sub stor">Dimrar, reläer, LED, armaturer, uttag, sensorer och knappar, styrda av Agir. Välj det du vill ha, så bokar vi en elektriker.</span>
      </div>

      <div className="rader" style={{ paddingTop: 8 }}>
        {FORDELAR.map(([t, s]) => (
          <div key={t} className="rad" style={{ minHeight: 56 }}>
            <Icon name="check" size={18} stroke={2.2} color="#2CC56F" />
            <span className="rad-text"><span className="rad-titel">{t}</span><span className="rad-sub">{s}</span></span>
          </div>
        ))}
      </div>

      {CATALOG.map((g) => (
        <div key={g.id}>
          <SectionLabel>{g.label}</SectionLabel>
          <div className="sortiment" style={{ padding: '4px 16px 0' }}>
            {g.items.map((p) => {
              const on = valda.includes(p.id);
              return (
                <button key={p.id} className={'produkt tryck' + (on ? ' vald' : '')} aria-pressed={on} onClick={() => toggle(p.id)}>
                  <span className="produkt-ikon" aria-hidden="true"><Icon name={on ? 'check' : p.kind} size={17} stroke={on ? 2.4 : 1.8} /></span>
                  <span className="produkt-text">
                    <span className="produkt-namn">{p.name}</span>
                    <span className="produkt-sub">{p.sub}</span>
                    <span className="pris">Pris kommer{p.electrician ? ' · elektriker' : ' · gör själv'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {valda.length > 0 && !form && (
        <div className="agir-fot">
          <button className="knapp-stor tryck" style={{ flex: 1 }} onClick={() => setForm(true)}>
            {elektriker ? `Boka elektriker · ${valda.length} valda` : `Beställ ${valda.length} ${valda.length === 1 ? 'produkt' : 'produkter'}`}
          </button>
        </div>
      )}

      {form && createPortal(
        <div className="dialog-bakgrund" onClick={() => setForm(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Boka elektriker" onClick={(e) => e.stopPropagation()}>
            <div className="ark-huvud">
              <span className="dialog-titel">{elektriker ? 'Boka elektriker' : 'Beställ'}</span>
              <button className="stang" onClick={() => setForm(false)} aria-label="Stäng"><Icon name="close" size={16} stroke={1.5} /></button>
            </div>
            <span className="rad-sub">{valda.length} {valda.length === 1 ? 'produkt vald' : 'produkter valda'}. En behörig elinstallatör hör av sig och ger ett fast pris för installationen.</span>
            <label className="falt"><span className="mini-label">NAMN</span><input className="agir-input" value={namn} onChange={(e) => setNamn(e.target.value)} autoComplete="name" /></label>
            <label className="falt"><span className="mini-label">TELEFON</span><input className="agir-input" value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
            <label className="falt"><span className="mini-label">ORT</span><input className="agir-input" value={ort} onChange={(e) => setOrt(e.target.value)} autoComplete="address-level2" /></label>
            <button className={'knapp-stor tryck' + (ok ? '' : ' av')} disabled={!ok} onClick={skicka}>Skicka förfrågan</button>
            <span className="rad-sub" style={{ textAlign: 'center' }}>Demo: förfrågan sparas i Händelser men skickas inte än.</span>
          </div>
        </div>, document.body)}
    </div>
  );
}
