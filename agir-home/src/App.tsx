import { useEffect } from 'react';
import { go, usePath } from './router';
import { applyScene, sceneById, useApp } from './state/store';
import { Toaster } from './components/toast';
import { Energi, Hem, Klimat, Kontroller, Ljus, Sakerhet } from './screens/PlanScreens';
import { Meny } from './screens/Meny';
import { Agir } from './screens/Agir';
import { Automationer, Handelser, Hushallet, Installningar } from './screens/Lists';
import { LaggTill, Valkommen } from './screens/Flows';
import { Enheter } from './screens/Enheter';

const ROUTES: Record<string, () => JSX.Element> = {
  '/': Hem, '/kontroller': Kontroller, '/ljus': Ljus, '/klimat': Klimat, '/energi': Energi, '/sakerhet': Sakerhet,
  '/meny': Meny, '/agir': Agir, '/automationer': Automationer, '/hushallet': Hushallet, '/installningar': Installningar,
  '/handelser': Handelser, '/lagg-till': LaggTill, '/valkommen': Valkommen, '/enheter': Enheter,
};

const TITLES: Record<string, string> = {
  '/': 'Villa Agir', '/kontroller': 'Kontroller', '/ljus': 'Ljus', '/klimat': 'Klimat', '/energi': 'Energi', '/sakerhet': 'Säkerhet',
  '/meny': 'Meny', '/agir': 'Agir', '/automationer': 'Automationer', '/hushallet': 'Hushållet', '/installningar': 'Inställningar',
  '/handelser': 'Händelser', '/lagg-till': 'Lägg till enhet', '/valkommen': 'Välkommen', '/enheter': 'Enheter och rum',
};

export function App() {
  const path = usePath();
  const ready = useApp((s) => s.ready);
  const onboarded = useApp((s) => s.onboarded);

  // Genvägar från hemskärmen (håll inne appikonen): /?scen=natt
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search).get('scen');
    if (q) { const sc = sceneById(q); if (sc) applyScene(sc); history.replaceState({}, '', '/'); }
    if (!onboarded && path === '/') go('/valkommen', { replace: true });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.title = `${TITLES[path] ?? 'Agir Home'} · Agir Home`; }, [path]);

  const Screen = ROUTES[path] ?? Hem;
  if (!ready) return <div className="laddar" aria-label="Laddar"><span className="orb liten" /></div>;
  return (
    <>
      <main className="app" key={path}><Screen /></main>
      <Toaster />
    </>
  );
}
