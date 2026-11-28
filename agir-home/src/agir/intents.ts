import type { DeviceState } from '../devices/types';
import { isLightLike, ROOMS } from '../home/model';
import { HOME_SCENES } from '../home/scenes';
import { allPlacements, applyScene, getState, logEvent, setAlarm, setDevice, setMany } from '../state/store';
import { fmtNum, fmtTemp, indoorTemp, lightsOn, openWindows, priceNow, PRICE_CURVE } from '../state/derived';

export interface Reply { title: string; detail: string }

const ROOM_WORDS: [string, string][] = [
  ['vardagsrum', 'vard'], ['kök', 'kok'], ['matplats', 'mat'], ['matbord', 'mat'], ['hall', 'hall'], ['wc', 'wc'], ['toa', 'wc'],
  ['arbetsrum', 'arb'], ['kontor', 'arb'], ['tvätt', 'tvatt'], ['entré', 'entre'], ['sovrum', 'sov'], ['badrum', 'bad'],
  ['klädkammare', 'klad'], ['barnrum', 'barn'], ['allrum', 'all'],
];

function findRooms(t: string) {
  return ROOM_WORDS.filter(([w]) => t.includes(w)).map(([, id]) => id).filter((v, i, a) => a.indexOf(v) === i);
}
const roomName = (id: string) => ROOMS.find((r) => r.id === id)!.def;
const num = (t: string) => { const m = t.match(/(\d+(?:[.,]\d)?)/); return m ? Number(m[1].replace(',', '.')) : null; };
const scene = (id: string) => HOME_SCENES.find((s) => s.id === id)!;

/**
 * Tolkar vanlig svenska och utför det direkt. Körs helt i telefonen –
 * senare kan samma gränssnitt prata med en språkmodell i Agir Hub.
 */
export function handle(input: string): Reply {
  const t = input.toLowerCase().trim().replace(/[!?.]/g, '');
  const s = getState();
  const P = allPlacements(s);
  const rooms = findRooms(t);
  const inRooms = (kind: string) => P.filter((p) => (kind === 'light' ? isLightLike(p) : p.kind === kind) && (rooms.length === 0 || rooms.includes(p.room)));

  // Enheter som nämns vid namn: "stäng av fläkten", "sätt på kaffebryggaren", "tänd ledlisten".
  const named = P.filter((p) => ['relay', 'plug', 'strip'].includes(p.kind)).find((p) => {
    const n = p.name.toLowerCase().replace(/[^a-zåäö]/g, '');
    const stem = n.split(/säng|dörren/)[0];
    return t.replace(/[^a-zåäö ]/g, '').replace(/ /g, '').includes(stem.slice(0, Math.max(4, stem.length - 2)));
  });
  if (named) {
    const off = /stäng|släck|av\b|stoppa/.test(t);
    const m = t.match(/(\d+)\s*(min|tim)/);
    const mins = m ? Number(m[1]) * (m[2] === 'tim' ? 60 : 1) : 0;
    const timerUntil = !off && mins ? Date.now() + mins * 60000 : undefined;
    setDevice(named.id, off ? { on: false } : { on: true, ...(timerUntil ? { timerUntil } : {}) });
    // Bestämd form: fläkten, kaffebryggaren, golvlampan, LED-listen.
    const def = named.name.includes(' ') ? named.name : /[ae]$/.test(named.name) ? named.name + 'n' : named.name + 'en';
    const nm = def.toLowerCase();
    return { title: off ? `${def} är avstängd.` : `${def} är på.`, detail: timerUntil ? `Jag stänger av ${nm} om ${mins} min.` : off ? '' : `Säg "stäng av ${nm} om 30 min" så sätter jag en timer.` };
  }

  if (/mysig|myspys|mys/.test(t)) {
    setMany({ l1: { on: true, value: 30, tone: 'warm' }, l3: { on: true, value: 25, tone: 'warm' }, l2: { on: false }, b1: { on: true, value: 0 }, m1: { on: true, value: 20 } });
    const h = s.devices.h1; if (h) setDevice('h1', { value: Math.min(30, h.value + 0.5), mode: 'comfort', on: true });
    return { title: 'Nu är det mysigt.', detail: 'Vardagsrum 30 % och varmt ljus, persiennerna ner, lugn musik på 20 %. Jag höjde golvvärmen en halv grad.' };
  }
  if (/jag går|går nu|hej då|borta/.test(t)) {
    applyScene(scene('borta'));
    return { title: 'Ha det bra.', detail: 'Jag har släckt allt, låst och slagit på larmet. Värmen sänks till 17° och är tillbaka till 22° när du kommer hem.' };
  }
  if (/god ?natt|sova|lägga oss/.test(t)) {
    applyScene(scene('natt'));
    return { title: 'Godnatt.', detail: 'Allt är släckt utom hallen på 5 %, dörren är låst och skalskyddet är på.' };
  }
  if (/film|bio/.test(t)) {
    applyScene(scene('film'));
    return { title: 'Filmdags.', detail: 'Vardagsrummet är nedsläckt till 15 %, persiennerna är nere och högtalaren på 60 %.' };
  }
  if (/jag är hemma|kommit hem|hemma/.test(t) && !/tänd|släck/.test(t)) {
    applyScene(scene('hemma'));
    return { title: 'Välkommen hem.', detail: 'Larmet är av och ljuset tänt där ni brukar vara.' };
  }

  if (/sparat|spara/.test(t)) {
    return { title: '312 kr i november.', detail: 'Mest på golvvärmen i badrummet och bilens nattladdning. Prognosen för december är ungefär 1 080 kr.' };
  }
  if (/elpris|kostar elen|elen kostar|billig/.test(t)) {
    const min = Math.min(...PRICE_CURVE), h = PRICE_CURVE.indexOf(min);
    return { title: `${fmtNum(priceNow(), 2)} kr/kWh just nu.`, detail: `Billigast i natt runt ${String(h).padStart(2, '0')}:00, ${Math.round(min * 100)} öre. Jag lägger golvvärme och laddning där.` };
  }

  if (/vatten/.test(t) && /stäng|av/.test(t)) {
    P.filter((p) => p.kind === 'leak').forEach((p) => setDevice(p.id, { on: false }));
    return { title: 'Vattnet är avstängt.', detail: 'Huvudkranen är stängd. Säg till när du vill slå på det igen.' };
  }

  if (/larm|skalskydd/.test(t)) {
    if (/av|stäng|avlarm/.test(t) && !/skalskydd/.test(t)) { setAlarm('off'); return { title: 'Avlarmat.', detail: 'Larmet är avstängt.' }; }
    if (/skalskydd|hemma/.test(t)) { setAlarm('perimeter'); return { title: 'Skalskyddet är på.', detail: 'Dörrar och fönster larmar, ni kan röra er fritt inne.' }; }
    if (/är|status/.test(t)) return { title: s.alarm === 'off' ? 'Larmet är av.' : 'Larmet är på.', detail: s.alarm === 'full' ? 'Fullt larm.' : s.alarm === 'perimeter' ? 'Skalskydd.' : 'Säg "larma" så slår jag på det.' };
    setAlarm('full'); return { title: 'Larmet är på.', detail: 'Fullt larm. Rörelse i huset larmar direkt till dig.' };
  }

  if (/lås/.test(t)) {
    const lock = P.find((p) => p.kind === 'lock')!;
    if (/är|låst\b.*\?|allt låst/.test(t) && !/lås (upp|dörren)/.test(t)) {
      const ok = s.devices[lock.id]?.on; const win = openWindows(s);
      return { title: ok ? 'Ja, dörren är låst.' : 'Nej, dörren är olåst.', detail: win.length ? `Men fönstret i ${roomName(win[0].room)} står öppet.` : 'Alla fönster är stängda.' };
    }
    if (/upp/.test(t)) { setDevice(lock.id, { on: false }); return { title: 'Dörren är upplåst.', detail: 'Den låses automatiskt igen om två minuter.' }; }
    setDevice(lock.id, { on: true }); return { title: 'Dörren är låst.', detail: 'Ytterdörren låstes nu.' };
  }

  if (/ladd|bilen/.test(t)) {
    const c = P.find((p) => p.kind === 'charger')!;
    if (/paus|stopp|sluta/.test(t)) { setDevice(c.id, { mode: 'pause' }); return { title: 'Laddningen är pausad.', detail: 'Säg "ladda smart" när du vill fortsätta.' }; }
    if (/nu|direkt/.test(t)) { setDevice(c.id, { mode: 'now' }); return { title: 'Laddar nu, 7,4 kW.', detail: `Elen kostar ${fmtNum(priceNow(), 2)} kr just nu.` }; }
    setDevice(c.id, { mode: 'smart' }); return { title: 'Smart laddning.', detail: 'Bilen laddas när elen är som billigast i natt.' };
  }

  if (/persienn|mörklägg|gardin/.test(t)) {
    const down = /ner|stäng|mörk/.test(t);
    inRooms('blind').forEach((p) => setDevice(p.id, { on: true, value: down ? 0 : 100 }));
    return { title: down ? 'Persiennerna går ner.' : 'Persiennerna går upp.', detail: rooms.length ? `I ${rooms.map(roomName).join(' och ')}.` : 'I hela huset.' };
  }

  if (/musik|högtalar|volym|spela/.test(t)) {
    const n = num(t);
    const stop = /stäng|av|pausa|tyst/.test(t);
    inRooms('media').forEach((p) => setDevice(p.id, stop ? { on: false } : { on: true, ...(n !== null ? { value: Math.min(100, n) } : {}) }));
    return { title: stop ? 'Musiken är pausad.' : 'Musiken spelar.', detail: n !== null && !stop ? `Volym ${n} %.` : '' };
  }

  if (/grad|varm|kall|värme|temperatur/.test(t)) {
    const heats = inRooms('heat');
    const n = num(t);
    if (/hur|vad är/.test(t) && n === null) {
      const temp = (id: string) => s.devices[id]?.reading ?? 21;
      if (rooms.length) {
        const r = heats.map((h) => `${fmtTemp(temp(h.id))} i ${roomName(h.room)}`).join(', ');
        return { title: r[0].toUpperCase() + r.slice(1) + '.', detail: `Ute är det ${fmtTemp(s.outdoor)}.` };
      }
      const sorted = [...heats].sort((a, b) => temp(b.id) - temp(a.id));
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      return { title: `${fmtTemp(indoorTemp(s))} inne.`, detail: `Varmast i ${roomName(hi.room)} ${fmtTemp(temp(hi.id))}, svalast i ${roomName(lo.room)} ${fmtTemp(temp(lo.id))}. Ute är det ${fmtTemp(s.outdoor)}.` };
    }
    const delta = /varmare|höj/.test(t) ? 1 : /kallare|sänk/.test(t) ? -1 : 0;
    const patch = (st: DeviceState): Partial<DeviceState> => ({ on: true, mode: 'comfort', value: Math.max(15, Math.min(30, n !== null ? Math.round(n * 2) / 2 : st.value + delta)) });
    heats.forEach((h) => { const st = s.devices[h.id]; if (st) setDevice(h.id, patch(st)); });
    const where = rooms.length ? rooms.map(roomName).join(' och ') : 'alla rum';
    return { title: n !== null ? `${fmtTemp(Math.round(n * 2) / 2)} i ${where}.` : delta > 0 ? `Varmare i ${where}.` : `Svalare i ${where}.`, detail: 'Golvvärmen ställs om nu. Det tar ungefär en timme att märka.' };
  }

  const tand = /tänd|på/.test(t) && !/släck/.test(t);
  const slack = /släck|stäng av|mörkt/.test(t);
  if (tand || slack || /ljus|lampa|lampor|dimma|procent|%/.test(t)) {
    const lamps = inRooms('light');
    const n = num(t);
    if (slack) {
      const targets = rooms.length ? lamps : lightsOn(s);
      targets.forEach((p) => setDevice(p.id, { on: false }));
      return { title: rooms.length ? `Släckt i ${rooms.map(roomName).join(' och ')}.` : 'Allt är släckt.', detail: targets.length ? `${targets.length} ${targets.length === 1 ? 'lampa' : 'lampor'} släcktes.` : 'Det var redan mörkt.' };
    }
    const tone = /varm/.test(t) ? 'warm' : /kall|vit/.test(t) ? 'cool' : undefined;
    lamps.forEach((p) => setDevice(p.id, { on: true, ...(n !== null ? { value: Math.max(1, Math.min(100, n)) } : {}), ...(tone ? { tone } : {}) }));
    return { title: rooms.length ? `Tänt i ${rooms.map(roomName).join(' och ')}.` : 'Allt är tänt.', detail: n !== null ? `${n} % ljusstyrka.` : `${lamps.length} ${lamps.length === 1 ? 'lampa' : 'lampor'}.` };
  }

  logEvent('agir', 'Agir förstod inte', `"${input}"`);
  return { title: 'Det kan jag inte än.', detail: 'Prova "släck i köket", "22 grader i badrummet", "lås dörren" eller "godnatt".' };
}

export const SUGGESTIONS = ['Gör det mysigt', 'Jag går nu', 'Hur mycket har vi sparat?', 'Godnatt'];
