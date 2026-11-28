import { roomById } from '../home/model';
import { HOME_SCENES } from '../home/scenes';
import { allPlacements, applyScene, logEvent, setDevice, type AppState } from '../state/store';
import { fmtNum, fmtTemp, lightsOn, openWindows, priceNow, PRICE_CURVE, totalPower } from '../state/derived';

export type Context = 'hem' | 'kontroller' | 'ljus' | 'klimat' | 'energi' | 'sakerhet';

export interface Insight {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

const cheapestHours = () => {
  const sorted = PRICE_CURVE.map((p, h) => ({ p, h })).sort((a, b) => a.p - b.p).slice(0, 3).map((x) => x.h).sort((a, b) => a - b);
  return { from: sorted[0], to: sorted[sorted.length - 1] + 1, price: Math.min(...PRICE_CURVE) };
};
const ore = (kr: number) => Math.round(kr * 100) + ' öre';
const hh = (h: number) => String(h).padStart(2, '0');

/**
 * Agir tittar på hemmet just nu och väljer det viktigaste att säga.
 * Varningar först, sedan förslag som sparar pengar eller klick, sist en lugn rapport.
 */
export function insightFor(s: AppState, ctx: Context): Insight {
  const P = allPlacements(s);
  const d = s.devices;
  const hour = new Date().getHours();
  const out: (Insight & { prio: number; ctx?: Context[] })[] = [];

  for (const p of P.filter((x) => x.kind === 'leak' && d[x.id]?.alert)) {
    out.push({ id: 'lacka-' + p.id, prio: 100, text: `Vatten upptäckt i ${roomById(p.room)?.def}. Stäng vattnet direkt?`,
      action: { label: 'Stäng vattnet', run: () => setDevice(p.id, { on: false }) } });
  }

  const lock = P.find((x) => x.kind === 'lock');
  if (lock && d[lock.id] && !d[lock.id].on) {
    out.push({ id: 'olast', prio: 90, text: 'Ytterdörren är olåst. Jag låser den automatiskt om två minuter.',
      action: { label: 'Lås nu', run: () => setDevice(lock.id, { on: true }) } });
  }

  for (const w of openWindows(s)) {
    const heat = P.find((x) => x.kind === 'heat' && x.room === w.room);
    const rn = roomById(w.room)?.def;
    if (heat && d[heat.id]?.on && d[heat.id].mode !== 'off') {
      out.push({ id: 'fonster-' + w.id, prio: 80, ctx: ['hem', 'kontroller', 'klimat', 'sakerhet'],
        text: `Fönstret i ${rn} står öppet och golvvärmen går. Ska jag pausa den tills fönstret stängs?`,
        action: { label: 'Pausa värmen', run: () => { setDevice(heat.id, { mode: 'off', on: false }); logEvent('klim', `Värmen pausad i ${rn}`, 'Fönstret är öppet.', true); } } });
    } else {
      out.push({ id: 'fonster-info-' + w.id, prio: 30, ctx: ['klimat', 'sakerhet'],
        text: `Fönstret i ${rn} står öppet. Golvvärmen där är pausad tills det stängs.` });
    }
  }

  const charger = P.find((x) => x.kind === 'charger');
  const price = priceNow();
  if (charger && d[charger.id]?.mode === 'now' && price > 0.9) {
    const c = cheapestHours();
    out.push({ id: 'dyrladd', prio: 70, ctx: ['hem', 'energi'],
      text: `Elen kostar ${fmtNum(price, 2)} kr just nu. Laddar jag i stället ${hh(c.from)}–${hh(c.to)} sparar ni ungefär ${Math.round((price - c.price) * 30)} kr.`,
      action: { label: 'Ladda smart', run: () => setDevice(charger.id, { mode: 'smart' }) } });
  }

  // Saker som står på i onödan: kaffebryggaren, fläkten, utebelysningen mitt på dagen.
  for (const p of P.filter((x) => (x.kind === 'plug' && x.variant !== 'dim') || x.kind === 'relay')) {
    const st = d[p.id];
    if (!st?.on || st.timerUntil) continue;
    const mins = st.changedAt ? (Date.now() - st.changedAt) / 60000 : 0;
    const name = p.name.toLowerCase();
    if (p.kind === 'plug' && mins > 40) {
      out.push({ id: 'plugg-' + p.id + '-' + Math.floor((st.changedAt ?? 0) / 1e6), prio: 65, ctx: ['hem', 'energi', 'kontroller', 'ljus'],
        text: `${p.name} har stått på i ${Math.round(mins)} minuter. Ska jag stänga av den?`,
        action: { label: 'Stäng av', run: () => setDevice(p.id, { on: false }) } });
    } else if (name.includes('fläkt') && mins > 30) {
      const mo = P.find((x) => x.kind === 'motion' && x.room === p.room);
      const quiet = !mo || !d[mo.id]?.lastMotion || Date.now() - d[mo.id].lastMotion! > 20 * 60000;
      if (quiet) out.push({ id: 'flakt-' + p.id, prio: 40, ctx: ['hem', 'energi', 'kontroller'],
        text: `Fläkten ${roomById(p.room)?.def === 'toaletten' ? 'på toaletten' : 'i ' + roomById(p.room)?.def} har gått i ${Math.round(mins)} min. Ska jag stänga av den om 10 minuter?`,
        action: { label: 'Av om 10 min', run: () => setDevice(p.id, { timerUntil: Date.now() + 10 * 60000 }) } });
    } else if (name.includes('ute') && hour >= 9 && hour < 15) {
      out.push({ id: 'ute-' + p.id, prio: 35, ctx: ['hem', 'energi', 'ljus'],
        text: 'Utebelysningen är tänd mitt på dagen. Ska jag släcka den och tända igen vid solnedgången?',
        action: { label: 'Släck', run: () => setDevice(p.id, { on: false }) } });
    }
  }

  const lit = lightsOn(s);
  if ((hour >= 23 || hour < 5) && lit.length >= 3 && s.scene !== 'natt') {
    const natt = HOME_SCENES.find((x) => x.id === 'natt')!;
    out.push({ id: 'sent', prio: 60, ctx: ['hem', 'ljus', 'kontroller'],
      text: `Klockan är mycket och ${lit.length} lampor lyser fortfarande. Ska jag köra Godnatt?`,
      action: { label: 'Godnatt', run: () => applyScene(natt) } });
  }

  if (s.scene === 'borta' && lit.length > 0 && ctx !== 'sakerhet') {
    out.push({ id: 'borta-ljus', prio: 50, text: `Ni är borta men ${lit.length === 1 ? 'en lampa lyser' : lit.length + ' lampor lyser'}. Släcka?`,
      action: { label: 'Släck allt', run: () => lit.forEach((l) => setDevice(l.id, { on: false })) } });
  }

  const pick = out.filter((i) => !s.dismissed.includes(i.id) && (!i.ctx || i.ctx.includes(ctx))).sort((a, b) => b.prio - a.prio)[0];
  if (pick) return pick;

  const c = cheapestHours();
  switch (ctx) {
    case 'ljus':
      return { id: 'ljus', text: 'Jag dimmar vardagsrummet till 30 % klockan 21:30, som ni brukar. Hallen tänds automatiskt när någon kommer hem.' };
    case 'klimat':
      return { id: 'klimat', text: `Badrummet förvärms ${hh(c.from)}:10, när elen är billigast. Alla fönster är stängda, så golvvärmen går som vanligt.` };
    case 'energi':
      return { id: 'energi', text: `Bilen laddas ${hh(c.from)}–${hh(c.to)} när elen kostar ${ore(c.price)}. Just nu drar huset ${fmtNum(Math.round(totalPower(s) * 10) / 10)} kW${totalPower(s) > 1.5 ? ' – köket mest, diskmaskinen är igång' : ''}.` };
    case 'sakerhet':
      if (s.alarm === 'full') return { id: 'larm-full', text: 'Fullt larm är på. Rörelse i huset larmar direkt till dig och larmcentralen.' };
      if (s.alarm === 'perimeter') return { id: 'larm-skal', text: 'Skalskyddet är på. Dörrar och fönster larmar, ni kan röra er fritt inne.' };
      return { id: 'sak', text: 'Ytterdörren är låst. Senaste rörelse vid entrén 21:38 – ett bud. Inga läckor.' };
    default:
      if (s.scene === 'borta') return { id: 'borta', text: 'Huset är låst och larmat. Jag tänder lite då och då så det ser ut som att någon är hemma.' };
      if (s.scene === 'natt') return { id: 'natt', text: 'God natt. Allt är låst och hallen lyser svagt om någon går upp.' };
      if (s.scene === 'film') return { id: 'film', text: 'Trevlig film. Jag tänder hallen svagt om någon går upp under filmen.' };
      return { id: 'lugnt', text: `Ytterdörren är låst. Köksgolvet förvärms klockan ${c.from === 2 ? 'två' : hh(c.from)}, när elen kostar ${ore(c.price)}.` };
  }
}

/** Kort statusrad i Agir-kortet. */
export function summaryLine(s: AppState, ctx: Context) {
  const lock = allPlacements(s).find((p) => p.kind === 'lock');
  const locked = lock ? s.devices[lock.id]?.on : true;
  const win = openWindows(s).length;
  const lit = lightsOn(s).length;
  const winTxt = win ? ` · ${win} fönster öppet` : '';
  const lampor = (n: number) => `${n} ${n === 1 ? 'lampa' : 'lampor'}`;
  if (ctx === 'ljus') return `${lampor(lit)} ${lit === 1 ? 'tänd' : 'tända'}`;
  if (ctx === 'klimat') {
    const heat = allPlacements(s).filter((p) => p.kind === 'heat' && s.devices[p.id]?.on && s.devices[p.id].mode !== 'off').length;
    const t = allPlacements(s).filter((p) => p.kind === 'heat').map((p) => s.devices[p.id]?.reading ?? 21);
    return `${fmtTemp(t.reduce((a, b) => a + b, 0) / Math.max(1, t.length))} inne · ${heat} golvvärmekretsar på`;
  }
  if (ctx === 'energi') return `${fmtNum(Math.round(totalPower(s) * 10) / 10)} kW just nu`;
  if (ctx === 'sakerhet') return `${s.alarm === 'off' ? 'Avlarmat' : s.alarm === 'perimeter' ? 'Skalskydd' : 'Fullt larm'} · ${locked ? 'låst' : 'olåst'}${winTxt}`;
  return `${lampor(lit)} · ${locked ? 'låst' : 'olåst'}${winTxt}`;
}
