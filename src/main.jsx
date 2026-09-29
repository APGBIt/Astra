import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useApp, runReconcile, applyTheme, getState } from './app/store.js';
import { useRoute, go } from './app/router.js';
import { initPWA } from './app/pwa.js';
import { Toasts, Celebrations, Confirmer } from './ui/kit.jsx';
import { Welcome, Create, NewGoal } from './screens/Onboarding.jsx';
import { Home } from './screens/Home.jsx';
import { NewMission, MissionDetail } from './screens/Missions.jsx';
import { Capture } from './screens/Capture.jsx';
import { Receipt } from './screens/Receipt.jsx';
import { Finance } from './screens/Finance.jsx';
import { Path, Boss } from './screens/Path.jsx';
import { Areas, Health, Mood, People, Learn, Focus } from './screens/Areas.jsx';
import { Character, Inn, Shop, Chronicle, Recovery } from './screens/Character.jsx';
import { Settings } from './screens/Settings.jsx';

function Screen({ route }) {
  const s = useApp();
  const [a, b, c] = route.parts;
  const q = route.query;
  if (!s.profile.onboarded) {
    if (a === 'crear') return <Create />;
    return <Welcome />;
  }
  switch (a) {
    case undefined: return <Home />;
    case 'mision':
      if (b === 'nueva') return <><Home /><NewMission /></>;
      if (c === 'editar') return <><Home /><NewMission id={b} /></>;
      return <><Home /><MissionDetail id={b} /></>;
    case 'registrar': return <><Home /><Capture /></>;
    case 'recibo': return <Receipt />;
    case 'finanzas': return <Finance query={q} />;
    case 'camino': return <Path query={q} />;
    case 'meta': return <NewGoal query={q} />;
    case 'jefe': return <Boss id={b} />;
    case 'areas': return <Areas />;
    case 'area': return <Health />;
    case 'animo': return <Mood />;
    case 'personas': return <People />;
    case 'aprender': return <Learn />;
    case 'enfoque': return <Focus />;
    case 'personaje': return <Character />;
    case 'posada': return <Inn />;
    case 'tienda': return <Shop />;
    case 'cronica': return <Chronicle />;
    case 'recuperacion': return <Recovery />;
    case 'ajustes': return <Settings />;
    default: return <Home />;
  }
}

function App() {
  const route = useRoute();
  useEffect(() => {
    applyTheme(getState().settings.theme);
    runReconcile();
    const onVis = () => { if (!document.hidden) runReconcile(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(runReconcile, 60000);
    if (!getState().profile.onboarded && location.hash && location.hash !== '#/crear') go('/', { replace: true });
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, []);
  return (
    <div class="app">
      <Screen key={route.path} route={route} />
      <Toasts />
      <Celebrations />
      <Confirmer />
    </div>
  );
}

initPWA();
render(<App />, document.getElementById('astra'));
