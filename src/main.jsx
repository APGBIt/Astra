import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useApp, runReconcile, applyTheme, getState, onChange } from './app/store.js';
import { startNotifications } from './app/notify.js';
import { useRoute, go } from './app/router.js';
import { initPWA } from './app/pwa.js';
import { Toasts, Celebrations, Confirmer } from './ui/kit.jsx';
import { Welcome, Create, NewGoal } from './screens/Onboarding.jsx';
import { Home } from './screens/Home.jsx';
import { NewMission, MissionDetail, MissionsList } from './screens/Missions.jsx';
import { Todos, TodoSheet } from './screens/Todos.jsx';
import { Record, RecordSection } from './screens/Record.jsx';
import { Capture } from './screens/Capture.jsx';
import { Receipt } from './screens/Receipt.jsx';
import { Finance } from './screens/Finance.jsx';
import { Import } from './screens/Import.jsx';
import { refreshRate } from './app/fx.js';
import { Path, Boss } from './screens/Path.jsx';
import { Areas, Health, People, Learn, Focus } from './screens/Areas.jsx';
import { Nutrients } from './screens/Nutrition.jsx';
import { Mood } from './screens/Emotions.jsx';
import { Calm } from './screens/Calm.jsx';
import { Journal } from './screens/Journal.jsx';
import { Character, Inn, Shop, Chronicle, Recovery } from './screens/Character.jsx';
import { Settings } from './screens/Settings.jsx';
import { Hogar } from './screens/Hogar.jsx';
import { Compras } from './screens/Compras.jsx';
import { Wins } from './screens/Wins.jsx';
import { Growth } from './screens/Growth.jsx';
import { WordScreen } from './screens/Word.jsx';
import { SyncScreen } from './screens/Sync.jsx';
import { startSync, syncNow, connectGoogle, syncConfig } from './app/sync.js';
import { handleGoogleRedirect } from './app/google.js';
import { toast } from './ui/kit.jsx';

// Al volver de iniciar sesión con Google, el permiso llega en la dirección: se guarda antes de abrir la app.
const googleBack = handleGoogleRedirect();

// Las hojas (misión, pendiente, registrar) se abren encima de su pantalla. Esa pantalla no se vuelve
// a montar: conserva dónde ibas en la lista, el filtro y la búsqueda.
function screenKey(parts) {
  const [a] = parts;
  if (!a || a === 'mision' || a === 'registrar') return 'hoy';
  if (a === 'pendientes' || a === 'misiones') return a;
  return parts.join('/');
}
const sameScreen = (x, y) => screenKey(x.parts) === screenKey(y.parts);

function Screen({ route }) {
  const s = useApp();
  const [a, b, c] = route.parts;
  const q = route.query;
  const k = route.path;
  if (!s.profile.onboarded) {
    if (a === 'crear') return <Create />;
    if (a === 'sincronizar') return <SyncScreen />;
    return <Welcome />;
  }
  switch (a) {
    case undefined:
    case 'mision':
    case 'registrar': {
      let sheet = null;
      if (a === 'registrar') sheet = <Capture key={k} />;
      else if (a === 'mision') sheet = b === 'nueva' ? <NewMission key={k} /> : c === 'editar' ? <NewMission key={k} id={b} /> : <MissionDetail key={k} id={b} />;
      return <><Home />{sheet}</>;
    }
    case 'misiones':
      return <><MissionsList />{b && (c === 'editar' ? <NewMission key={k} id={b} backTo="/misiones" /> : <MissionDetail key={k} id={b} base="/misiones" />)}</>;
    case 'pendientes':
      return <><Todos query={q} />{b && (b === 'nuevo' ? <TodoSheet key={k} query={q} /> : <TodoSheet key={k} id={b} />)}</>;
    case 'expediente': return b ? <RecordSection id={b} /> : <Record />;
    case 'recibo': return <Receipt />;
    case 'finanzas': return <Finance query={q} />;
    case 'importar': return <Import query={q} />;
    case 'camino': return <Path query={q} />;
    case 'meta': return <NewGoal query={q} />;
    case 'jefe': return <Boss id={b} />;
    case 'areas': return <Areas />;
    case 'area': return <Health query={q} />;
    case 'nutrientes': return <Nutrients query={q} />;
    case 'animo': return <Mood />;
    case 'calma': return <Calm query={q} />;
    case 'diario': return <Journal query={q} />;
    case 'personas': return <People />;
    case 'aprender': return <Learn />;
    case 'enfoque': return <Focus />;
    case 'personaje': return <Character />;
    case 'posada': return <Inn />;
    case 'tienda': return <Shop />;
    case 'cronica': return <Chronicle />;
    case 'recuperacion': return <Recovery />;
    case 'ajustes': return <Settings />;
    case 'hogar': return <Hogar query={q} />;
    case 'compras': return <Compras query={q} />;
    case 'logros': return <Wins query={q} />;
    case 'metas': return <Growth query={q} />;
    case 'palabra': return <WordScreen />;
    case 'sincronizar': return <SyncScreen />;
    default: return <Home />;
  }
}

function App() {
  const route = useRoute(sameScreen);
  useEffect(() => {
    applyTheme(getState().settings.theme);
    runReconcile();
    // La tasa del dólar se actualiza sola una vez al día (si hay internet).
    setTimeout(() => { if (getState().profile.onboarded) refreshRate(); }, 1500);
    const onVis = () => { if (!document.hidden) { runReconcile(); if (getState().profile.onboarded) refreshRate(); } };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(runReconcile, 60000);
    if (!getState().profile.onboarded && location.hash && location.hash !== '#/crear' && location.hash !== '#/sincronizar') go('/', { replace: true });
    startSync();
    startNotifications(getState, onChange);
    if (googleBack) {
      if (!googleBack.ok) toast(googleBack.error === 'access_denied' ? 'No diste permiso para usar tu Drive' : 'No se pudo iniciar sesión con Google', 'info');
      else if (googleBack.intent === 'connect' || syncConfig().provider !== 'google') connectGoogle().catch((e) => toast((e && e.message) || 'No se pudo conectar con Google Drive', 'info'));
      else syncNow({ manual: true });
    }
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, []);
  return (
    <div class="app">
      <Screen key={screenKey(route.parts)} route={route} />
      <Toasts />
      <Celebrations />
      <Confirmer />
    </div>
  );
}

initPWA();
render(<App />, document.getElementById('astra'));
