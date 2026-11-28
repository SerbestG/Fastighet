import { useState } from 'react';
import { AgirTip, Chip, Done, Header, Link, Row, SectionLabel, Switch } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { toast } from '../components/toast';
import {
  addAutomation, allPlacements, deleteScene, dismiss, markEventDone, patchApp, resetDemo, toggleAutomation, togglePerm,
  useApp, type EventCat, type PermKey,
} from '../state/store';
import { clock } from '../state/derived';
import { loadHAConfig } from '../devices';

/* ---------------- Automationer ---------------- */

const WHEN = { hem: 'Jag kommer hem', klocka: 'Kl 07:00', dorr: 'Dörren öppnas', sol: 'Solnedgång', pris: 'Billig el' } as const;
const DO = { hall: 'Tänd hallen', varme: 'Höj värmen', pers: 'Persienner ner', musik: 'Spela musik', las: 'Lås dörren' } as const;

export function Automationer() {
  const s = useApp((x) => x);
  const [when, setWhen] = useState<keyof typeof WHEN>('hem');
  const [dos, setDos] = useState<(keyof typeof DO)[]>(['hall', 'varme']);
  const [tip, setTip] = useState<'ja' | null>(null);
  const tipOpen = !s.dismissed.includes('tip-kaffe') && tip === null;
  const aktiva = s.automations.filter((a) => a.on).length;
  const kan = dos.length > 0;
  return (
    <div className="skarm lista-skarm">
      <Header title="Automationer" status={`${aktiva} aktiva · nästa: Godnatt 23:00`} />
      <div className="mellan" />
      {tipOpen && (
        <AgirTip label="Agir har sett ett mönster" text="Ni stänger av kaffebryggaren varje vardag runt 07:45. Ska jag göra det automatiskt när sista personen går?"
          yes="Skapa automation" no="Inte nu"
          onYes={() => { addAutomation('Kaffebryggaren av', 'När sista personen går på vardagar'); setTip('ja'); dismiss('tip-kaffe'); }}
          onNo={() => dismiss('tip-kaffe')} />
      )}
      {tip === 'ja' && <Done>Klart. Kaffebryggaren stängs av när ni går.</Done>}

      <div className="kort ny-auto">
        <span className="ny-auto-titel">Ny automation</span>
        <span className="mini-label">NÄR</span>
        <div className="chips">{(Object.keys(WHEN) as (keyof typeof WHEN)[]).map((k) => <Chip key={k} on={when === k} onClick={() => setWhen(k)}>{WHEN[k]}</Chip>)}</div>
        <span className="mini-label">GÖR</span>
        <div className="chips">{(Object.keys(DO) as (keyof typeof DO)[]).map((k) => <Chip key={k} on={dos.includes(k)} onClick={() => setDos(dos.includes(k) ? dos.filter((x) => x !== k) : [...dos, k])}>{DO[k]}</Chip>)}</div>
        <button className={'knapp-stor tryck' + (kan ? '' : ' av')} disabled={!kan}
          onClick={() => { addAutomation(WHEN[when], dos.map((d) => DO[d]).join(', ')); setDos([]); toast('Automationen är sparad och aktiv.'); }}>
          {kan ? 'Spara automation' : 'Välj minst en åtgärd'}
        </button>
      </div>

      {s.customScenes.length > 0 && (
        <>
          <SectionLabel>Egna scener</SectionLabel>
          <div className="rader">
            {s.customScenes.map((sc) => (
              <Row key={sc.id} label={sc.label} sub={`${Object.keys(sc.patches).length} enheter · syns på Hem och Ljus`}
                right={<button className="chip tryck" onClick={() => { deleteScene(sc.id); toast(`${sc.label} är borttagen.`); }}>Ta bort</button>} />
            ))}
          </div>
        </>
      )}

      <SectionLabel>Dina automationer</SectionLabel>
      <div className="rader">
        {s.automations.map((a) => <Row key={a.id} label={a.name} sub={a.sub} right={<Switch on={a.on} label={a.name} onToggle={() => toggleAutomation(a.id)} />} />)}
      </div>
    </div>
  );
}

/* ---------------- Hushållet ---------------- */

const RIGHTS: [PermKey, string, string, string][] = [
  ['ljus', 'Ljus', 'Alla rum', 'Bara sitt eget rum'], ['varme', 'Golvvärme', 'Alla zoner', '±1° i sitt rum'],
  ['las', 'Låsa upp ytterdörren', 'Med telefon, klocka eller kod', 'Kan bara låsa'], ['larm', 'Larm', 'Slå på och av', 'Ingen åtkomst'],
  ['kamera', 'Kameror', 'Live och historik', 'Ingen åtkomst'], ['ladd', 'Laddbox', 'Starta och schemalägga', 'Ingen åtkomst'],
];

export function Hushallet() {
  const s = useApp((x) => x);
  const [sel, setSel] = useState('barn');
  const [invited, setInvited] = useState(false);
  const extended = s.dismissed.includes('tip-mormor-ja');
  const tipOpen = !s.dismissed.includes('tip-mormor');
  const m = s.members.find((x) => x.id === sel)!;
  const owner = sel === 'du';
  const p = s.perms[sel];
  return (
    <div className="skarm lista-skarm">
      <Header title="Hushållet" status={`${s.members.length} personer · Barn hemma · Sambo 12 min bort`} />
      <div className="medlemmar">
        {s.members.map((x) => (
          <button key={x.id} className="medlem tryck" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
            <span className="medlem-ava" style={{ background: x.color, boxShadow: sel === x.id ? '0 0 0 3px #18191B, 0 0 0 5px #FFFFFF' : 'none' }}>{x.initial}</span>
            <span className="medlem-namn">{x.name}</span>
            <span className="medlem-roll">{x.id === 'gast' && extended ? 't.o.m. nästa sön' : x.role}</span>
          </button>
        ))}
        <button className="medlem tryck bjud" onClick={() => { setInvited(true); toast('Inbjudan skickad. Den gäller i 48 timmar.'); }}>
          <span className="medlem-ava plus"><Icon name="plus" size={22} stroke={2} /></span>
          <span className="medlem-namn">{invited ? 'Skickad' : 'Bjud in'}</span>
        </button>
      </div>
      {tipOpen && (
        <AgirTip label="Agir · gästtillgång" text="Mormors tillgång tar slut på söndag, men hon har låst upp dörren varje dag den här veckan. Ska jag förlänga en vecka?"
          yes="Förläng" no="Låt den gå ut" onYes={() => { dismiss('tip-mormor'); dismiss('tip-mormor-ja'); }} onNo={() => dismiss('tip-mormor')} />
      )}
      {extended && <Done>Mormor har tillgång en vecka till. Hon får en notis.</Done>}
      <div className="vald">
        <span className="vald-namn">{m.name}</span>
        <span className="rad-sub">{m.id === 'gast' && extended ? 'Gäst · tillgång till och med nästa söndag' : m.desc}</span>
      </div>
      <SectionLabel>Får styra</SectionLabel>
      <div className="rader">
        {RIGHTS.map(([k, label, yes, no]) => (
          <Row key={k} label={label} sub={p[k] ? yes : no} right={<Switch on={p[k]} label={label} locked={owner} onToggle={() => togglePerm(sel, k)} />} />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Inställningar ---------------- */

export function Installningar() {
  const s = useApp((x) => x);
  const n = allPlacements(s).length;
  const ha = loadHAConfig();
  const menu: [string, IconName, string, string][] = [
    ['/hushallet', 'people', 'Hushållet', `${s.members.length} personer · 1 gäst`],
    ['/enheter', 'grid', 'Enheter och rum', `${n} enheter · 13 rum · batteri och signal`],
    ['/automationer', 'clock', 'Automationer', `${s.automations.filter((a) => a.on).length} aktiva`],
    ['/anslut', 'home', 'Home Assistant', ha ? `Ansluten · ${Object.keys(ha.map).length} riktiga enheter` : 'Koppla in riktiga enheter'],
    ['/sortiment', 'spark', 'Agir-sortimentet', 'Dimrar, reläer, LED, sensorer · boka elektriker'],
    ['/enheter', 'hub', 'Agir Hub', `${s.source || 'Demo-läge'} · fungerar även utan internet`],
    ['/installningar', 'shield', 'Integritet', 'All data i EU · kameror och röst lokalt'],
  ];
  const notes: [string, string, string, boolean?][] = [
    ['lacka', 'Vattenläcka', 'Alltid på', true], ['las', 'Dörren lämnas olåst', 'Efter 10 minuter'], ['larm', 'Larmet går', 'Till alla vuxna'],
    ['agir', 'Förslag från Agir', 'Högst ett om dagen'], ['pris', 'Elpriset är högt', 'Tips om vad som kan vänta'],
  ];
  return (
    <div className="skarm lista-skarm">
      <Header title="Inställningar" status={`Villa Agir · ${n} enheter · ${s.online ? 'allt online' : 'offline'}`} backTo="/meny" backLabel="Meny" />
      <div className="mellan" />
      {s.update !== 'klar' && (
        <div className="tip in">
          <div className="tip-body upd">
            <Icon name="download" size={26} color="#C9CACD" />
            <div className="upd-text">
              <span className="upd-titel">Ny uppdatering</span>
              <span className="tip-text dim">{s.update === 'natt' ? 'Agir Hub 2.4 installeras i natt kl 03:00. Allt fungerar som vanligt under tiden.' : 'Agir Hub 2.4 finns. Bättre elprisprognoser, snabbare lås och stöd för fler laddboxar.'}</span>
            </div>
          </div>
          <div className="tip-knappar">
            <button className="tryck" onClick={() => patchApp({ update: 'natt' })}>{s.update === 'natt' ? 'Planerad 03:00 ✓' : 'Installera i natt'}</button>
            <button className="tryck tip-nej" onClick={() => { patchApp({ update: 'klar' }); toast('Agir Hub är uppdaterad till 2.4.'); }}>Installera nu</button>
          </div>
        </div>
      )}
      <nav className="meny-lista">
        {menu.map(([to, icon, label, sub]) => (
          <Link key={label} to={to} className="meny-rad tryck">
            <Icon name={icon} size={24} stroke={1.7} color="#C9CACD" />
            <span className="meny-rad-text"><span className="meny-rad-titel">{label}</span><span className="rad-sub">{sub}</span></span>
            <Icon name="chevron" size={20} stroke={2} color="#6C6E72" />
          </Link>
        ))}
      </nav>
      <SectionLabel>Aviseringar</SectionLabel>
      <div className="rader">
        {notes.map(([k, label, sub, lock]) => (
          <Row key={k} label={label} sub={sub} right={<Switch on={!!s.notify[k]} locked={lock} label={label} onToggle={() => patchApp({ notify: { ...s.notify, [k]: !s.notify[k] } })} />} />
        ))}
      </div>
      <SectionLabel>Demo</SectionLabel>
      <div className="rader">
        <Row label="Börja om demot" sub="Återställer enheter, scener och välkomstguiden" right={<button className="chip tryck" onClick={() => { if (confirm('Återställ allt i demot?')) resetDemo(); }}>Återställ</button>} />
      </div>
    </div>
  );
}

/* ---------------- Händelser ---------------- */

const CAT_COLOR: Record<EventCat, string> = { sak: '#F0A030', klim: '#FF9B57', agir: '#E6CFA6', energi: '#2CC56F' };
const FILTERS: [EventCat | 'allt', string][] = [['allt', 'Allt'], ['sak', 'Säkerhet'], ['klim', 'Klimat'], ['energi', 'Energi'], ['agir', 'Agir']];

export function Handelser() {
  const s = useApp((x) => x);
  const [f, setF] = useState<EventCat | 'allt'>('allt');
  const today = s.events.filter((e) => new Date(e.at).toDateString() === new Date().toDateString());
  const list = [...s.events].sort((a, b) => b.at - a.at).filter((e) => f === 'allt' || e.cat === f);
  return (
    <div className="skarm lista-skarm">
      <Header title="Händelser" status={`Idag · ${today.length} händelser · Agir skötte ${today.filter((e) => e.byAgir).length} själv`} />
      <div role="group" aria-label="Filtrera" className="chips filter">
        {FILTERS.map(([id, label]) => <Chip key={id} on={f === id} onClick={() => setF(id)}>{label}</Chip>)}
      </div>
      <div className="logg">
        {list.map((e) => (
          <div key={e.id} className="logg-rad">
            <span className="logg-tid">{clock(e.at)}</span>
            <div className="logg-text">
              <span className="logg-titel"><span className="prick" style={{ background: CAT_COLOR[e.cat] }} />{e.title}</span>
              <span className="rad-sub">{e.byAgir ? `${e.sub.replace(/\.$/, '')} · av Agir` : e.sub}</span>
              {e.action && (
                <button className={'handling tryck' + (e.done ? ' klar-knapp' : '')} disabled={e.done}
                  onClick={() => { markEventDone(e.id); toast(e.action!.done + '.'); }}>
                  {e.done ? `${e.action.done} ✓` : e.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && <span className="tom">Inga händelser här än.</span>}
      </div>
    </div>
  );
}
