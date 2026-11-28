import { useState } from 'react';
import { Header, SectionLabel } from '../components/ui';
import { Icon } from '../components/Icon';
import { toast } from '../components/toast';
import { loadHAConfig, saveHAConfig } from '../devices';
import { fetchEntities, type HAEntity } from '../devices/homeAssistantAdapter';
import { FLOORS, KIND_LABEL, ROOMS, roomById } from '../home/model';
import { addDevice, allPlacements, useApp } from '../state/store';

/**
 * Anslut Home Assistant direkt i appen – ingen kod, inga miljövariabler.
 * Riktiga enheter kopplas in en i taget; resten av huset fortsätter som demo.
 */
export function Anslut() {
  const s = useApp((x) => x);
  const saved = loadHAConfig();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState(saved?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entities, setEntities] = useState<HAEntity[] | null>(null);
  // entitet → 'new:<rum>' | 'dev:<agir-id>' | ''
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(saved?.map ?? {}).map(([agir, ent]) => [ent, `dev:${agir}`])));

  const P = allPlacements(s);
  const origin = location.origin;

  const test = async () => {
    setBusy(true); setError('');
    try {
      const list = await fetchEntities(url.trim(), token.trim());
      setEntities(list);
      if (!list.length) setError('Anslutningen fungerar, men Home Assistant har inga lampor, brytare eller sensorer än.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel.');
    } finally { setBusy(false); }
  };

  const save = () => {
    const map: Record<string, string> = {};
    for (const [ent, c] of Object.entries(choice)) {
      if (!c) continue;
      const e = entities?.find((x) => x.id === ent);
      if (c.startsWith('dev:')) map[c.slice(4)] = ent;
      else if (c.startsWith('new:') && e?.kind) {
        const pl = addDevice(e.kind, c.slice(4), e.name, 'Home Assistant');
        map[pl.id] = ent;
      }
    }
    saveHAConfig({ url: url.trim().replace(/\/$/, ''), token: token.trim(), map });
    toast(`${Object.keys(map).length} enheter kopplade. Startar om …`);
    setTimeout(() => location.assign('/enheter'), 900);
  };

  const disconnect = () => {
    saveHAConfig(null);
    toast('Home Assistant är frånkopplat. Startar om …');
    setTimeout(() => location.assign('/installningar'), 900);
  };

  const count = Object.values(choice).filter(Boolean).length;

  return (
    <div className="skarm lista-skarm">
      <Header title="Home Assistant" backTo="/installningar" backLabel="Inställningar"
        status={saved ? `Ansluten · ${Object.keys(saved.map).length} enheter kopplade` : 'Koppla in riktiga enheter, en i taget'} />

      <div className="kort ny-auto" style={{ marginTop: 20 }}>
        <label className="falt">
          <span className="mini-label">ADRESS</span>
          <input className="agir-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.ui.nabu.casa" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="falt">
          <span className="mini-label">NYCKEL (LONG-LIVED ACCESS TOKEN)</span>
          <input className="agir-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Klistra in nyckeln" autoComplete="off" />
        </label>
        <span className="rad-sub">Skapas i Home Assistant under din profil → Säkerhet. Nyckeln sparas bara i den här telefonen.</span>
        <button className={'knapp-stor tryck' + (url && token && !busy ? '' : ' av')} disabled={!url || !token || busy} onClick={test}>
          {busy ? 'Ansluter …' : entities ? 'Hämta igen' : 'Anslut och hämta enheter'}
        </button>
        {error && <span className="fel" role="alert">{error}</span>}
      </div>

      {entities && entities.length > 0 && (
        <>
          <SectionLabel>Hittade i Home Assistant</SectionLabel>
          <span className="rad-sub" style={{ display: 'block', padding: '0 24px 8px' }}>Välj var varje enhet hör hemma. Okopplade enheter syns inte i Agir.</span>
          <div className="enh-rum">
            {entities.map((e) => (
              <div key={e.id} className="enh-rad koppla">
                <span className="enh-ikon" aria-hidden="true"><Icon name={e.kind!} size={17} stroke={1.8} /></span>
                <span className="enh-text">
                  <span className="enh-namn">{e.name}</span>
                  <span className="enh-sub">{KIND_LABEL[e.kind!]} · {e.id}</span>
                  <select className="koppla-val" aria-label={`Koppla ${e.name}`} value={choice[e.id] ?? ''} onChange={(ev) => setChoice({ ...choice, [e.id]: ev.target.value })}>
                    <option value="">Koppla inte</option>
                    {FLOORS.map((f) => (
                      <optgroup key={f.id} label={`Ny enhet · ${f.label}`}>
                        {ROOMS.filter((r) => r.floor === f.id).map((r) => <option key={r.id} value={`new:${r.id}`}>Ny i {r.def}</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="Ersätt en demoenhet">
                      {P.filter((p) => p.kind === e.kind).map((p) => <option key={p.id} value={`dev:${p.id}`}>{p.name} · {roomById(p.room)?.name}</option>)}
                    </optgroup>
                  </select>
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 16px 0' }}>
            <button className={'knapp-stor tryck' + (count ? '' : ' av')} style={{ width: '100%' }} disabled={!count} onClick={save}>
              {count ? `Koppla ${count} ${count === 1 ? 'enhet' : 'enheter'}` : 'Välj minst en enhet'}
            </button>
          </div>
        </>
      )}

      <SectionLabel>Om det inte ansluter</SectionLabel>
      <div className="tip-body" style={{ padding: '4px 24px' }}>
        <span className="rad-sub">Home Assistant måste tillåta Agirs adress. Lägg till det här i <b className="vit">configuration.yaml</b> och starta om Home Assistant:</span>
        <pre className="kod">{`http:\n  cors_allowed_origins:\n    - ${origin}`}</pre>
        <span className="rad-sub">Adressen ska börja med https://. Enklast är Home Assistant Cloud (Nabu Casa), som ger en färdig adress.</span>
      </div>

      {saved && (
        <div style={{ padding: '18px 16px 0' }}>
          <button className="knapp-stor gra tryck" style={{ width: '100%' }} onClick={disconnect}>Koppla från Home Assistant</button>
        </div>
      )}
    </div>
  );
}
