import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { handle, SUGGESTIONS, type Reply } from '../agir/intents';
import { useApp } from '../state/store';
import { clock } from '../state/derived';

interface Msg { who: 'du' | 'agir'; text: string; detail?: string }

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string }; isFinal: boolean }[] }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
const SpeechRec = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    u.rate = 1.02;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* tyst */ }
}

export function Agir() {
  const events = useApp((s) => s.events);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const rec = useRef<SR | null>(null);
  const voice = useRef(false);

  useEffect(() => () => rec.current?.stop(), []);

  const ask = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const r: Reply = handle(t);
    setMsgs((m) => [...m, { who: 'du', text: t }, { who: 'agir', text: r.title, detail: r.detail }]);
    setText('');
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (voice.current) { speak(`${r.title} ${r.detail}`); voice.current = false; }
  };

  const mic = () => {
    if (listening) { rec.current?.stop(); setListening(false); return; }
    if (!SpeechRec) {
      // Ingen röstigenkänning i webbläsaren – visa hur det fungerar med ett exempel.
      setListening(true);
      setTimeout(() => { setListening(false); ask('Gör det mysigt'); }, 1600);
      return;
    }
    const r = new SpeechRec();
    r.lang = 'sv-SE';
    r.interimResults = true;
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      setInterim(res[0].transcript);
      if (res.isFinal) { voice.current = true; ask(res[0].transcript); setInterim(''); }
    };
    r.onend = () => { setListening(false); setInterim(''); };
    r.onerror = () => { setListening(false); setInterim(''); };
    rec.current = r;
    setListening(true);
    r.start();
  };

  const last = msgs.filter((m) => m.who === 'agir').slice(-1)[0];
  const log = events.filter((e) => e.byAgir).slice(0, 6);

  return (
    <div className="skarm lista-skarm agir-skarm">
      <Header title="Agir" status="Lär sig ert hem sedan 1 december · allt stannar i EU" />

      <div className="agir-hero">
        <div className={'orb' + (listening ? ' lyssnar' : '')} aria-hidden="true" />
        <span className="agir-rubrik" aria-live="polite">{listening ? (interim || 'Jag lyssnar …') : last ? last.text : 'Vad kan jag göra?'}</span>
        {last && !listening && last.detail && <span className="agir-svar in">{last.detail}</span>}
      </div>

      <div className="forslag">
        {SUGGESTIONS.map((q) => <button key={q} className="chip tryck" onClick={() => ask(q)}>{q}</button>)}
      </div>

      {msgs.length > 2 && (
        <div className="chatt" aria-label="Tidigare i samtalet">
          {msgs.slice(0, -2).map((m, i) => (
            <div key={i} className={'bubbla ' + m.who}>{m.text}{m.detail && <span>{m.detail}</span>}</div>
          ))}
        </div>
      )}

      <span className="logg-rubrik">Det här har Agir gjort själv idag</span>
      <div className="logg">
        {log.map((e) => (
          <div key={e.id} className="logg-rad">
            <span className="logg-tid">{clock(e.at)}</span>
            <span className="logg-text"><span>{e.title}</span><span className="rad-sub">{e.sub}</span></span>
          </div>
        ))}
      </div>

      <form className="agir-fot" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input className="agir-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv till Agir …" aria-label="Skriv till Agir" enterKeyHint="send" />
        {text.trim()
          ? <button className="mic" type="submit" aria-label="Skicka"><Icon name="send" size={22} stroke={1.6} /></button>
          : <button className={'mic' + (listening ? ' is-on' : '')} type="button" onClick={mic} aria-pressed={listening} aria-label={listening ? 'Sluta lyssna' : 'Prata med Agir'}><Icon name="mic" size={24} stroke={1.5} /></button>}
      </form>
    </div>
  );
}
