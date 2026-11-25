import { Header, Link } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { insightFor } from '../agir/insights';
import { allPlacements, useApp } from '../state/store';
import { fmtNum, fmtTemp, indoorTemp, openWindows, totalPower } from '../state/derived';

interface Tile { to: string; label: string; big: string; sub: string; rgb: string; icon: IconName }

export function Meny() {
  const s = useApp((x) => x);
  const P = allPlacements(s);
  const lock = P.find((p) => p.kind === 'lock');
  const locked = lock ? s.devices[lock.id]?.on : true;
  const win = openWindows(s).length;
  const heating = P.filter((p) => p.kind === 'heat' && s.devices[p.id]?.on && s.devices[p.id].mode !== 'off' && (s.devices[p.id].reading ?? 0) < s.devices[p.id].value).length;
  const active = s.automations.filter((a) => a.on).length;
  const todays = s.events.filter((e) => new Date(e.at).toDateString() === new Date().toDateString());
  const byAgir = todays.filter((e) => e.byAgir).length;
  const alarmTxt = s.alarm === 'off' ? 'avlarmat' : s.alarm === 'perimeter' ? 'skalskydd' : 'larmat';

  const tiles: Tile[] = [
    { to: '/energi', label: 'Energi', big: '312 kr', sub: `sparat i nov · ${fmtNum(Math.round(totalPower(s) * 10) / 10)} kW nu`, rgb: '44,197,111', icon: 'bolt' },
    { to: '/automationer', label: 'Automationer', big: `${active} aktiva`, sub: 'Godnatt kl 23:00', rgb: '212,180,131', icon: 'clock' },
    { to: '/sakerhet', label: 'Säkerhet', big: locked ? 'Låst' : 'Olåst', sub: `${alarmTxt}${win ? ` · ${win} fönster öppet` : ' · allt stängt'}`, rgb: locked ? '240,160,48' : '229,72,77', icon: 'shield' },
    { to: '/klimat', label: 'Klimat', big: fmtTemp(indoorTemp(s)), sub: `ute ${fmtTemp(s.outdoor)} · ${heating} rum värms`, rgb: '255,155,87', icon: 'heat' },
    { to: '/handelser', label: 'Händelser', big: `${todays.length} idag`, sub: `Agir skötte ${byAgir} själv`, rgb: '167,139,250', icon: 'list' },
    { to: '/installningar', label: 'Inställningar', big: `${P.length} enheter`, sub: s.online ? 'allt online' : 'offline', rgb: '164,166,170', icon: 'gear' },
  ];

  const ins = insightFor(s, 'hem');

  return (
    <div className="skarm lista-skarm meny-glod">
      <Header title="Meny" status="Allt i hemmet, ett tryck bort" />

      <Link to="/hushallet" className="kort hushall-kort tryck" style={{ ['--i' as string]: 0 }}>
        <span className="hushall-ava" aria-hidden="true">VA</span>
        <span className="hushall-text"><span className="hushall-namn">Villa Agir</span><span className="rad-sub">Ägare · {s.members.length} personer</span></span>
        <span className="avatarer" aria-hidden="true">{s.members.map((m) => <span key={m.id} style={{ background: m.color }} />)}</span>
      </Link>

      <nav aria-label="Huvudmeny" className="rutnat">
        {tiles.map((t, i) => (
          <Link key={t.to} to={t.to} className="kort ruta tryck" style={{ ['--i' as string]: i, background: `radial-gradient(120% 90% at 100% 0%, rgba(${t.rgb},0.22), rgba(${t.rgb},0) 60%), rgba(255,255,255,0.045)` }}>
            <span className="ruta-ikon" aria-hidden="true" style={{ background: `rgba(${t.rgb},0.16)`, color: `rgb(${t.rgb})`, boxShadow: `0 0 18px rgba(${t.rgb},0.25)` }}>
              <Icon name={t.icon} size={18} stroke={2} />
            </span>
            <span className="ruta-text">
              <span className="ruta-label">{t.label}</span>
              <span className="ruta-big">{t.big}</span>
              <span className="ruta-sub">{t.sub}</span>
            </span>
          </Link>
        ))}
      </nav>

      <Link to="/lagg-till" className="kort lagg-till tryck" style={{ ['--i' as string]: 6 }}>
        <Icon name="plus" size={20} stroke={2} />Lägg till enhet eller rum
      </Link>

      <Link to="/agir" className="kort agir-rad tryck" style={{ ['--i' as string]: 7 }}>
        <span className="agir-rad-ikon" aria-hidden="true"><Icon name="spark" size={16} stroke={1.6} /></span>
        <span className="agir-rad-text"><span className="tip-label">Agir</span><span>{ins.text}</span></span>
        <Icon name="chevron" size={18} color="#6C6E72" />
      </Link>
    </div>
  );
}
