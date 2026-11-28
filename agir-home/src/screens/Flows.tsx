import { useEffect, useRef, useState } from 'react';
import { AgirTip, Chip, Done, Header, Switch } from '../components/ui';
import { Icon } from '../components/Icon';
import { GlowSlider } from '../components/GlowSlider';
import { FLOORS, isLightLike, ROOMS } from '../home/model';
import { ALL_PRODUCTS, CATALOG, type Product } from '../home/catalog';
import { addDevice, addAutomation, allPlacements, getState, patchApp, setMany, setView } from '../state/store';
import { fmtTemp } from '../state/derived';
import { go } from '../router';

/* ---------------- Lägg till enhet ---------------- */

const NEARBY = ['d1', 'lk'];
const GUESS: Partial<Record<string, string>> = { d1: 'kok', lk: 'wc', m1: 'hall', k1: 'entre', v1: 'sov', sp1: 'kok', sp2: 'vard', j1: 'vard' };

export function LaggTill() {
  const [step, setStep] = useState(0);
  const [prod, setProd] = useState<Product>(ALL_PRODUCTS[0]);
  const [room, setRoom] = useState('kok');
  const [tip, setTip] = useState<'ja' | 'nej' | null>(null);
  const t = useRef<number>();
  useEffect(() => () => window.clearTimeout(t.current), []);

  const start = (pr: Product) => {
    setProd(pr); setRoom(GUESS[pr.id] ?? 'vard'); setStep(1); setTip(null);
    window.scrollTo(0, 0);
    t.current = window.setTimeout(() => setStep(2), 1800);
  };
  const finish = () => {
    const pl = addDevice(prod.kind, room, prod.defaultName, prod.name, prod.variant);
    setView({ floor: pl.floor });
    setStep(3);
  };
  const roomDef = ROOMS.find((r) => r.id === room)?.def ?? '';
  const lightLike = isLightLike({ kind: prod.kind, variant: prod.variant });

  return (
    <div className="skarm lista-skarm">
      <Header title="Lägg till enhet" backTo="/meny" backLabel="Meny" status={['Steg 1 av 4 · välj eller skanna', 'Steg 2 av 4 · ansluter', 'Steg 3 av 4 · placera', 'Klart'][step]} />
      <div className="flode">
        {step === 0 && (
          <div className="in kolumn">
            <button className="skanna tryck" onClick={() => start(ALL_PRODUCTS[0])} aria-label="Skanna QR-kod">
              <span className="hörn tl" /><span className="hörn tr" /><span className="hörn bl" /><span className="hörn br" />
              <span className="skanna-linje" aria-hidden="true" />
              <span className="skanna-text">Skanna Matter-koden på kartongen · tryck för att skanna</span>
            </button>
            <span className="mini-label pad">AGIR HITTADE I NÄRHETEN</span>
            {NEARBY.map((id) => ALL_PRODUCTS.find((x) => x.id === id)!).map((n) => (
              <button key={n.id} className="nara tryck" onClick={() => start(n)}>
                <Icon name={n.kind} size={24} stroke={1.7} color="#C9CACD" />
                <span className="rad-text"><span className="rad-titel">{n.name}</span><span className="rad-sub">Ny · redo att kopplas</span></span>
                <span className="nara-cta">Lägg till</span>
              </button>
            ))}
            {CATALOG.map((g) => (
              <div key={g.id} className="kolumn tät">
                <span className="mini-label pad">{g.label.toUpperCase()}</span>
                <div className="sortiment">
                  {g.items.map((pr) => (
                    <button key={pr.id} className="produkt tryck" onClick={() => start(pr)}>
                      <span className="produkt-ikon" aria-hidden="true"><Icon name={pr.kind} size={17} stroke={1.8} /></span>
                      <span className="produkt-text">
                        <span className="produkt-namn">{pr.name}</span>
                        <span className="produkt-sub">{pr.sub}{pr.electrician ? ' · elektriker' : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="in kolumn centrerad">
            <svg className="snurr" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#2C2D30" strokeWidth="4" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="#D4B483" strokeWidth="4" strokeLinecap="round" strokeDasharray="110 400" />
            </svg>
            <span className="flode-titel">Ansluter {prod.name}</span>
            <span className="rad-sub">Matter över Thread · via Agir Hub</span>
            <div className="kort checklista" role="status">
              <span><b>✓</b> Enheten hittad</span><span><b>✓</b> Säker krypterad koppling</span><span className="dim">{prod.sub}</span>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="in kolumn">
            <span className="flode-titel pad">Var sitter den?</span>
            <span className="rad-sub pad">Agir gissar <b className="vit">{ROOMS.find((r) => r.id === (GUESS[prod.id] ?? 'vard'))?.name}</b> utifrån signalstyrkan.</span>
            {FLOORS.map((f) => (
              <div key={f.id} className="kolumn tät">
                <span className="mini-label pad">{f.label.toUpperCase()}</span>
                <div className="rumval">
                  {ROOMS.filter((r) => r.floor === f.id).map((r) => (
                    <button key={r.id} className={'rumknapp tryck' + (room === r.id ? ' is-on' : '')} aria-pressed={room === r.id} onClick={() => setRoom(r.id)}>{r.name}</button>
                  ))}
                </div>
              </div>
            ))}
            <button className="knapp-stor tryck" onClick={finish}>Lägg till i {roomDef}</button>
          </div>
        )}
        {step === 3 && (
          <div className="in kolumn centrerad">
            <span className="bock"><Icon name="check" size={40} stroke={2.2} color="#2CC56F" /></span>
            <span className="flode-titel">{prod.defaultName} i {roomDef} är klar</span>
            <span className="rad-sub">Syns på ritningen och kan styras av Agir.</span>
          </div>
        )}
      </div>
      {step === 3 && tip === null && (lightLike || prod.kind === 'leak' || prod.kind === 'motion') && (
        <AgirTip label="Agir föreslår"
          text={lightLike ? 'Vill du att den ingår i Kväll och Godnatt, och följer dygnsrytmen så att ljuset blir varmare mot kvällen?'
            : prod.kind === 'leak' ? 'Ska jag stänga huvudkranen automatiskt och larma alla vuxna om sensorn känner vatten?'
              : `Ska jag tända ${roomDef} när någon går in och det är mörkt, och släcka efter två minuter utan rörelse?`}
          yes="Ja, gör det" no="Inte nu" onYes={() => setTip('ja')} onNo={() => setTip('nej')} />
      )}
      {step === 3 && tip === 'ja' && <Done>{lightLike ? 'Klart. Den ingår nu i Kväll, Godnatt och följer dygnet.' : prod.kind === 'leak' ? 'Klart. Vattnet stängs automatiskt vid läcka.' : 'Klart. Rummet tänds vid rörelse när det är mörkt.'}</Done>}
      {step === 3 && (
        <div className="knapprad pad-sida">
          <button className="knapp-stor gra tryck" onClick={() => { setStep(0); setTip(null); }}>Lägg till fler</button>
          <button className="knapp-stor tryck" onClick={() => go('/kontroller')}>Visa på ritningen</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Välkommen ---------------- */

const TILES: [number, number, number, number, boolean][] = [[0, 0, 200, 170, true], [200, 0, 150, 120, true], [200, 120, 150, 100, false], [0, 170, 110, 90, true], [110, 170, 90, 90, false], [0, 260, 200, 120, false], [200, 220, 150, 80, false], [200, 300, 150, 80, true]];

export function Valkommen() {
  const [step, setStep] = useState(0);
  const [wake, setWake] = useState(getState().wake);
  const [temp, setTemp] = useState(getState().comfort);
  const [pref, setPref] = useState({ borta: true, natt: true, sol: true });
  const [inv, setInv] = useState({ sambo: true, barn: false, gast: false });
  const antal = Object.values(inv).filter(Boolean).length;
  const next = () => setStep((x) => Math.min(3, x + 1));

  const done = () => {
    const s = getState();
    const heat = allPlacements(s).filter((p) => p.kind === 'heat' && s.devices[p.id]?.mode === 'comfort');
    setMany(Object.fromEntries(heat.map((h) => [h.id, { value: temp }])));
    if (pref.sol) {
      const [h, m] = wake.split(':').map(Number);
      const t = new Date(0, 0, 1, h, m - 20);
      const at = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      addAutomation('Mjuk väckning', `${at} · sovrummet tonas upp inför ${wake}`, `time:${at}`, ['wake']);
    }
    patchApp({
      onboarded: true, wake, comfort: temp,
      automations: getState().automations.map((a) => (a.id === 'a1' ? { ...a, on: pref.natt } : a.id === 'a2' ? { ...a, on: pref.borta } : a)),
    });
    go('/', { replace: true });
  };

  const prefs: [keyof typeof pref, string, string][] = [['borta', 'När sista personen går', 'Släck, lås och sänk värmen'], ['natt', 'Godnatt', 'Kl 23 släcks allt utom hallen'], ['sol', 'Mjuk väckning', 'Ljuset tonas upp 20 min innan']];
  const invs: [keyof typeof inv, string, string][] = [['sambo', 'Sambo eller partner', 'Full behörighet'], ['barn', 'Barn', 'Styr sitt eget rum'], ['gast', 'Gäst eller familj', 'Tidsbegränsad tillgång']];

  return (
    <div className="skarm valkommen">
      <div className="valk-topp">
        <span className="valk-logo">AGIR</span>
        <div className="steg" role="img" aria-label={`Steg ${step + 1} av 4`}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: i === step ? 22 : 8, background: i <= step ? '#FFFFFF' : '#3A3B3F' }} />)}
        </div>
      </div>

      {step === 0 && (
        <div className="in valk-steg">
          <div className="valk-hus" aria-hidden="true">
            <div className="valk-skugga" />
            <div className="valk-plan">
              {TILES.map(([x, y, w, h, lit], i) => (
                <span key={i} style={{ left: x + 3, top: y + 3, width: w - 6, height: h - 6, animationDelay: `${i * 70}ms`,
                  background: lit ? 'radial-gradient(circle at 50% 45%, rgba(255,200,130,0.5), rgba(255,200,130,0.05) 75%), #2C2D30' : '#26272A' }} />
              ))}
            </div>
          </div>
          <span className="valk-kicker">Villa Agir · 186 m²</span>
          <h1 className="valk-h1">Välkommen hem</h1>
          <span className="valk-ingress">Ditt hem är redan smart. {allPlacements(getState()).length} enheter i 13 rum är installerade och testade.</span>
          <div className="flex1" />
          <button className="knapp-stor tryck" onClick={next}>Kom igång</button>
          <span className="valk-fot">Tar under en minut</span>
        </div>
      )}

      {step === 1 && (
        <div className="in valk-steg gap">
          <h1 className="valk-h2">Hur vill du ha det?</h1>
          <span className="rad-sub stor">Agir börjar med det här och lär sig sedan av er vardag.</span>
          <span className="mini-label">DU VAKNAR OFTAST</span>
          <div className="vakna">{['06:00', '06:30', '07:00', '08:00'].map((t) => <Chip key={t} on={wake === t} onClick={() => setWake(t)}>{t}</Chip>)}</div>
          <div className="komfort-rad"><span className="mini-label">KOMFORT</span><span className="komfort-varde">{fmtTemp(temp)}</span></div>
          <GlowSlider value={temp} min={19} max={24} step={0.5} look="heat" icon="heat" label="Komforttemperatur" valueText={`${temp} grader`} onChange={setTemp} />
          <div className="kort rader-kort">
            {prefs.map(([k, label, sub]) => (
              <div key={k} className="rad inre"><span className="rad-text"><span className="rad-titel">{label}</span><span className="rad-sub">{sub}</span></span>
                <Switch on={pref[k]} label={label} onToggle={() => setPref({ ...pref, [k]: !pref[k] })} /></div>
            ))}
          </div>
          <div className="flex1" />
          <button className="knapp-stor tryck" onClick={next}>Fortsätt</button>
        </div>
      )}

      {step === 2 && (
        <div className="in valk-steg gap">
          <h1 className="valk-h2">Bor du med någon?</h1>
          <span className="rad-sub stor">De får egen inloggning med BankID. Barn får en enklare vy.</span>
          {invs.map(([k, name, sub]) => (
            <button key={k} className={'bjudin tryck' + (inv[k] ? ' is-on' : '')} aria-pressed={inv[k]} onClick={() => setInv({ ...inv, [k]: !inv[k] })}>
              <span className="rad-text"><span className="rad-titel">{name}</span><span className="rad-sub">{sub}</span></span>
              <span className="bjudin-mark">{inv[k] ? '✓ Bjuds in' : 'Lägg till'}</span>
            </button>
          ))}
          <div className="flex1" />
          <button className="knapp-stor tryck" onClick={next}>{antal ? `Skicka ${antal} ${antal === 1 ? 'inbjudan' : 'inbjudningar'}` : 'Hoppa över'}</button>
        </div>
      )}

      {step === 3 && (
        <div className="in valk-steg slut">
          <h1 className="valk-h1">Hemmet är ditt.</h1>
          <div className="kort sammanfattning">
            <span className="tip-label"><Icon name="spark" size={15} stroke={1.8} />Agir har ställt in</span>
            <span className="sammanfattning-text">
              Väckning {wake}{pref.sol ? ' med mjukt ljus' : ''}<br />
              Komfort {fmtTemp(temp)} i alla rum<br />
              {pref.borta ? 'Borta-läge när sista går' : 'Borta-läge manuellt'}{pref.natt ? ' · Godnatt kl 23' : ''}<br />
              Golvvärmen och laddningen följer elpriset
            </span>
          </div>
          <button className="knapp-stor tryck" onClick={done}>Öppna mitt hem</button>
        </div>
      )}
    </div>
  );
}
