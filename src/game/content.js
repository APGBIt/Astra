// Astra · contenido del juego: áreas, caminos, metas, pociones, tienda y textos.

export const AREAS = [
  { key: 'salud', area: 'Salud', attr: 'Vigor', cls: 'Atleta', icon: 'pulse', desc: 'Cuerpo fuerte, buen sueño y energía que dura.' },
  { key: 'emocional', area: 'Emocionales', attr: 'Temple', cls: 'Monje', icon: 'face', desc: 'Calma, claridad y manejo del estrés.' },
  { key: 'relaciones', area: 'Relaciones', attr: 'Vínculo', cls: 'Guardián', icon: 'people', desc: 'Cuidar a tu gente y tus vínculos.' },
  { key: 'crecimiento', area: 'Crecimiento', attr: 'Sabiduría', cls: 'Erudito', icon: 'sprout', desc: 'Aprender, leer y dominar habilidades.' },
  { key: 'finanzas', area: 'Finanzas', attr: 'Fortuna', cls: 'Mercader', icon: 'coins', desc: 'Orden con el dinero, ahorro y cero deudas.' },
  { key: 'laborales', area: 'Laborales', attr: 'Oficio', cls: 'Artesano', icon: 'briefcase', desc: 'Enfoque, buen trabajo y balance.' },
];
export const AREA = Object.fromEntries(AREAS.map((a) => [a.key, a]));
export const AREA_KEYS = AREAS.map((a) => a.key);

// Rutas de cada área dentro de la app.
export const AREA_ROUTE = {
  salud: '/area/salud',
  emocional: '/animo',
  relaciones: '/personas',
  crecimiento: '/aprender',
  finanzas: '/finanzas',
  laborales: '/enfoque',
};

// Fuentes que alimentan a los jefes automáticamente.
export const SOURCES = {
  debtPay: 'Cada pago a la deuda cuenta',
  saving: 'Cada ahorro registrado cuenta',
  manual: 'Registra cada avance',
  training: 'Cada entrenamiento cuenta',
  sleepNight: 'Cada noche que duermes tu meta cuenta',
  stepsDay: 'Cada día con tu meta de pasos cuenta',
  mood: 'Cada check-in de ánimo cuenta',
  calm: 'Cada sesión de calma cuenta',
  contact: 'Cada contacto con tu gente cuenta',
  pages: 'Cada página leída cuenta',
  practice: 'Cada hora de práctica cuenta',
  focus: 'Cada sesión de enfoque cuenta',
};

// Metas por camino. Cada meta es una campaña: dos capítulos de preparación y la batalla contra un jefe.
export const GOALS = {
  finanzas: [
    {
      id: 'deudas', title: 'Libre de deudas', desc: 'Salda una tarjeta o un préstamo.',
      unit: 'RD$', money: true, targetLabel: '¿Cuánto debes en total?', target: null, source: 'debtPay',
      boss: 'El Dragón de la Deuda', title2: 'Libre de cadenas',
      chapters: [
        { title: 'Conoce tus números', tasks: ['Registra tus gastos durante 7 días', 'Haz la lista de tus deudas con su tasa', 'Revisa tu último estado de cuenta'] },
        { title: 'Plan de ataque', tasks: ['Arma tu presupuesto del mes', 'Recorta un gasto fijo', 'Decide cuánto pagarás de más cada mes'] },
      ],
      missions: [
        { title: 'Anota los gastos del día', cost: 1, auto: { metric: 'tx', gte: 1 } },
        { title: 'Cero compras por impulso', cost: 1, kind: 'avoid' },
        { title: 'Revisa tu presupuesto', cost: 1, days: [0] },
      ],
    },
    {
      id: 'emergencia', title: 'Fondo de emergencia', desc: 'Junta tres meses de gastos.',
      unit: 'RD$', money: true, targetLabel: '¿Cuánto quieres juntar?', target: null, source: 'saving',
      boss: 'El Muro de la Incertidumbre', title2: 'Escudo de hierro',
      chapters: [
        { title: 'Conoce tus números', tasks: ['Calcula lo que gastas en un mes', 'Abre o separa una cuenta de ahorro', 'Define cuánto apartarás cada quincena'] },
        { title: 'Plan de ataque', tasks: ['Programa la transferencia automática', 'Vende algo que ya no uses', 'Recorta un gasto hormiga'] },
      ],
      missions: [
        { title: 'Anota los gastos del día', cost: 1, auto: { metric: 'tx', gte: 1 } },
        { title: 'Aparta tu ahorro de la quincena', cost: 1, days: [1] },
      ],
    },
    {
      id: 'presupuesto', title: 'Presupuesto que se cumple', desc: 'Tres meses sin pasarte.',
      unit: 'meses', money: false, targetLabel: '¿Cuántos meses?', target: 3, source: 'manual',
      boss: 'El Duende de los Antojos', title2: 'Mano firme',
      chapters: [
        { title: 'Conoce tus números', tasks: ['Registra tus gastos durante 7 días', 'Agrupa tus gastos por categoría'] },
        { title: 'Plan de ataque', tasks: ['Ponle presupuesto a cada categoría', 'Elige tu categoría más difícil y vigílala'] },
      ],
      missions: [{ title: 'Anota los gastos del día', cost: 1, auto: { metric: 'tx', gte: 1 } }],
    },
  ],
  salud: [
    {
      id: 'entrenar', title: 'Entrenar en serio', desc: '24 entrenamientos en 8 semanas.',
      unit: 'entrenamientos', target: 24, source: 'training',
      boss: 'El Gólem del Sofá', title2: 'Cuerpo de acero',
      chapters: [
        { title: 'Prepara el terreno', tasks: ['Elige tus tres días de entrenamiento', 'Prepara ropa y tenis la noche anterior', 'Haz una primera sesión suave'] },
        { title: 'Crea el hábito', tasks: ['Completa una semana con 3 sesiones', 'Anota cómo te sientes después de entrenar'] },
      ],
      missions: [
        { title: 'Entrenar 30 minutos', cost: 2, days: [1, 3, 5], feed: 'training' },
        { title: '8,000 pasos', cost: 1, auto: { metric: 'steps', gte: 8000 } },
      ],
    },
    {
      id: 'dormir', title: 'Dormir mejor', desc: '21 noches cumpliendo tu meta de sueño.',
      unit: 'noches', target: 21, source: 'sleepNight',
      boss: 'La Sombra del Insomnio', title2: 'Guardián del descanso',
      chapters: [
        { title: 'Observa tu sueño', tasks: ['Registra tu sueño 5 mañanas', 'Elige tu hora fija de acostarte'] },
        { title: 'Ritual nocturno', tasks: ['Deja el teléfono fuera de la cama una semana', 'Cena al menos 2 horas antes de dormir'] },
      ],
      missions: [
        { title: 'Dormir tu meta de horas', cost: 1, auto: { metric: 'sleep', gte: 'goal' }, penalty: true },
        { title: 'Sin pantallas 30 minutos antes de dormir', cost: 1 },
      ],
    },
    {
      id: 'moverse', title: 'Moverte cada día', desc: '30 días con tu meta de pasos.',
      unit: 'días', target: 30, source: 'stepsDay',
      boss: 'El Titán Sedentario', title2: 'Pies incansables',
      chapters: [
        { title: 'Mide tu punto de partida', tasks: ['Registra tus pasos 3 días', 'Elige una ruta para caminar'] },
        { title: 'Sube el ritmo', tasks: ['Camina después de una comida 5 días', 'Invita a alguien a caminar'] },
      ],
      missions: [{ title: '8,000 pasos', cost: 1, auto: { metric: 'steps', gte: 8000 }, penalty: true }],
    },
  ],
  emocional: [
    {
      id: 'calma', title: 'Calma diaria', desc: '30 sesiones de respiración o meditación.',
      unit: 'sesiones', target: 30, source: 'calm',
      boss: 'El Torbellino', title2: 'Mente en calma',
      chapters: [
        { title: 'Primeros pasos', tasks: ['Haz 5 minutos de respiración', 'Elige tu momento fijo del día'] },
        { title: 'Profundiza', tasks: ['Completa 7 días seguidos', 'Prueba una sesión de 15 minutos'] },
      ],
      missions: [{ title: '5 minutos de respiración', cost: 1, auto: { metric: 'calm', gte: 5 } }],
    },
    {
      id: 'conocete', title: 'Conócete', desc: '21 check-ins de ánimo para ver tus patrones.',
      unit: 'check-ins', target: 21, source: 'mood',
      boss: 'El Espejo Nublado', title2: 'Mirada clara',
      chapters: [
        { title: 'Ponle nombre', tasks: ['Haz tu primer check-in de ánimo', 'Escribe qué te ayuda en un mal día'] },
        { title: 'Descubre patrones', tasks: ['Haz check-in 7 días seguidos', 'Lee tus patrones en Crónica'] },
      ],
      missions: [{ title: 'Check-in de ánimo', cost: 1, auto: { metric: 'mood', gte: 1 } }],
    },
  ],
  relaciones: [
    {
      id: 'cercania', title: 'Cerca de los tuyos', desc: '12 contactos de verdad con tu gente.',
      unit: 'contactos', target: 12, source: 'contact',
      boss: 'El Muro del Silencio', title2: 'Corazón presente',
      chapters: [
        { title: 'Tu círculo', tasks: ['Agrega a 5 personas importantes', 'Pon cada cuánto quieres hablar con cada una'] },
        { title: 'Da el paso', tasks: ['Escríbele a alguien con quien no hablas hace meses', 'Planea una salida o comida juntos'] },
      ],
      missions: [{ title: 'Contacta a alguien de tu lista', cost: 1, auto: { metric: 'contact', gte: 1 } }],
    },
    {
      id: 'red', title: 'Amplía tu red', desc: 'Seis conexiones nuevas o reactivadas.',
      unit: 'conexiones', target: 6, source: 'manual',
      boss: 'La Niebla del Aislamiento', title2: 'Puente vivo',
      chapters: [
        { title: 'Prepárate', tasks: ['Actualiza tu perfil profesional', 'Anota 10 personas que admiras'] },
        { title: 'Sal al encuentro', tasks: ['Asiste a un evento o grupo', 'Pide un café a alguien de tu lista'] },
      ],
      missions: [{ title: 'Escribe a una persona nueva', cost: 1, days: [2, 4] }],
    },
  ],
  crecimiento: [
    {
      id: 'leer', title: 'Lector constante', desc: '1,200 páginas: unos cuatro libros.',
      unit: 'páginas', target: 1200, source: 'pages',
      boss: 'El Guardián de la Biblioteca', title2: 'Lector voraz',
      chapters: [
        { title: 'Elige tus libros', tasks: ['Agrega tu libro actual', 'Elige los siguientes tres'] },
        { title: 'Crea el hábito', tasks: ['Lee 7 días seguidos', 'Anota una idea de cada libro'] },
      ],
      missions: [{ title: 'Leer 20 páginas', cost: 1, feed: null }],
    },
    {
      id: 'habilidad', title: 'Domina una habilidad', desc: '30 horas de práctica deliberada.',
      unit: 'horas', target: 30, source: 'practice',
      boss: 'El Maestro Oculto', title2: 'Aprendiz consagrado',
      chapters: [
        { title: 'Define la habilidad', tasks: ['Escribe qué quieres poder hacer en 3 meses', 'Elige un curso o recurso'] },
        { title: 'Practica', tasks: ['Practica 5 días en una semana', 'Crea 10 tarjetas de repaso'] },
      ],
      missions: [{ title: 'Practica 30 minutos', cost: 2 }, { title: 'Repasa tus tarjetas', cost: 1 }],
    },
  ],
  laborales: [
    {
      id: 'enfoque', title: 'Enfoque profundo', desc: '40 sesiones de enfoque sin distracciones.',
      unit: 'sesiones', target: 40, source: 'focus',
      boss: 'El Demonio de la Distracción', title2: 'Mente de acero',
      chapters: [
        { title: 'Despeja el terreno', tasks: ['Apaga notificaciones que no necesitas', 'Define tu tarea más importante de mañana'] },
        { title: 'Protege tu tiempo', tasks: ['Bloquea dos horas de enfoque en tu calendario', 'Haz 5 sesiones en una semana'] },
      ],
      missions: [{ title: 'Una sesión de enfoque', cost: 2, days: [1, 2, 3, 4, 5], auto: { metric: 'focus', gte: 1 } }],
    },
    {
      id: 'proyecto', title: 'Proyecto clave', desc: '20 avances en tu proyecto más importante.',
      unit: 'avances', target: 20, source: 'manual',
      boss: 'El Laberinto del Pendiente', title2: 'Maestro artesano',
      chapters: [
        { title: 'Planea', tasks: ['Escribe el resultado que buscas', 'Divide el proyecto en entregas'] },
        { title: 'Arranca', tasks: ['Completa la primera entrega', 'Muestra tu avance a alguien'] },
      ],
      missions: [{ title: 'Avanza 30 minutos en tu proyecto', cost: 2, days: [1, 2, 3, 4, 5] }],
    },
  ],
};

export const CUSTOM_CHAPTERS = [
  { title: 'Prepárate', tasks: ['Escribe por qué quieres lograrlo', 'Define tu primer paso', 'Elige cuándo avanzarás cada semana'] },
  { title: 'Arranca', tasks: ['Haz tu primer avance', 'Revisa tu progreso al final de la semana'] },
];

export const DEADLINES = [
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 180, label: '6 meses' },
];

// Metas diarias que cada persona puede cambiar (Ajustes → Metas diarias).
export const DEFAULT_GOALS = { steps: 8000, water: 8, exercise: 30, veg: 5, calm: 10 };
export const GOAL_PRESETS = {
  sleep: [6, 7, 8, 9],
  steps: [5000, 8000, 10000, 12000],
  water: [6, 8, 10],
  exercise: [20, 30, 45, 60],
  veg: [3, 4, 5, 6],
  calm: [5, 10, 15, 20],
};

// ---------- Pendientes ----------

// Categorías fijas: General (sin atributo) y las seis áreas. Las propias se crean en la app.
export const TODO_GENERAL = { id: 'general', name: 'General', area: null };
// Tareas personales y de la casa (lavar, planchar, limpiar…). Suben Temple: un hogar en orden calma la mente.
export const TODO_HOGAR = { id: 'hogar', name: 'Hogar', area: 'emocional', color: 'hogar' };
export const TODO_XP = { base: 5, important: 5 };
export const TODO_GOLD = { base: 2, important: 2 };

// ---------- Hogar: rutinas de tareas personales ----------

export const CHORE_GROUPS = [
  { id: 'ropa', name: 'Ropa' },
  { id: 'limpieza', name: 'Limpieza' },
  { id: 'cocina', name: 'Cocina y compras' },
  { id: 'casa', name: 'Casa' },
  { id: 'personal', name: 'Cuidado personal' },
  { id: 'vehiculo', name: 'Vehículo' },
  { id: 'mascotas', name: 'Mascotas' },
  { id: 'mandados', name: 'Mandados' },
];

// Frecuencias: cada N días/semanas/meses (cuenta desde la última vez que la hiciste) o días fijos de la semana.
export const CHORE_FREQS = [
  { key: '1d', label: 'Cada día', freq: { type: 'every', n: 1, unit: 'day' } },
  { key: '2d', label: 'Cada 2 días', freq: { type: 'every', n: 2, unit: 'day' } },
  { key: '3d', label: 'Cada 3 días', freq: { type: 'every', n: 3, unit: 'day' } },
  { key: '1w', label: 'Cada semana', freq: { type: 'every', n: 1, unit: 'week' } },
  { key: '2w', label: 'Cada 2 semanas', freq: { type: 'every', n: 2, unit: 'week' } },
  { key: '1m', label: 'Cada mes', freq: { type: 'every', n: 1, unit: 'month' } },
  { key: '3m', label: 'Cada 3 meses', freq: { type: 'every', n: 3, unit: 'month' } },
];

const W = (n, unit = 'week') => ({ type: 'every', n, unit });
const D = (n) => ({ type: 'every', n, unit: 'day' });
const M = (n) => ({ type: 'every', n, unit: 'month' });
// Plantillas para empezar rápido. `pick`: vienen marcadas en la primera configuración.
export const CHORE_TEMPLATES = [
  { title: 'Lavar la ropa', group: 'ropa', icon: 'shirt', freq: W(1), mins: 45, pick: true },
  { title: 'Planchar', group: 'ropa', icon: 'iron', freq: W(1), mins: 40, pick: true },
  { title: 'Doblar y guardar la ropa', group: 'ropa', icon: 'shirt', freq: W(1), mins: 20 },
  { title: 'Lavar sábanas y toallas', group: 'ropa', icon: 'bed', freq: W(1), mins: 30, pick: true },
  { title: 'Llevar ropa a la lavandería', group: 'ropa', icon: 'bag', freq: W(2), mins: 20 },
  { title: 'Limpiar el baño', group: 'limpieza', icon: 'drop', freq: W(1), mins: 30, pick: true },
  { title: 'Barrer y trapear', group: 'limpieza', icon: 'broom', freq: D(3), mins: 30, pick: true },
  { title: 'Lavar los platos', group: 'limpieza', icon: 'utensils', freq: D(1), mins: 15 },
  { title: 'Limpiar la cocina', group: 'limpieza', icon: 'sparkle', freq: D(2), mins: 20 },
  { title: 'Sacar la basura', group: 'limpieza', icon: 'trash', freq: D(2), mins: 5, pick: true },
  { title: 'Quitar el polvo', group: 'limpieza', icon: 'sparkle', freq: W(1), mins: 20 },
  { title: 'Limpiar la nevera', group: 'limpieza', icon: 'snow', freq: M(1), mins: 30 },
  { title: 'Cocinar en casa', group: 'cocina', icon: 'utensils', freq: D(1), mins: 45, attr: 'salud' },
  { title: 'Preparar la comida de la semana', group: 'cocina', icon: 'utensils', freq: W(1), mins: 90, attr: 'salud' },
  { title: 'Hacer la compra del súper', group: 'cocina', icon: 'cart', freq: W(1), mins: 60, attr: 'finanzas', pick: true },
  { title: 'Comprar el botellón de agua', group: 'cocina', icon: 'drop', freq: W(1), mins: 10 },
  { title: 'Revisar el gas', group: 'cocina', icon: 'flame', freq: M(1), mins: 5 },
  { title: 'Cambiar las sábanas', group: 'casa', icon: 'bed', freq: W(1), mins: 15 },
  { title: 'Regar las plantas', group: 'casa', icon: 'sprout', freq: D(3), mins: 10 },
  { title: 'Ordenar el clóset', group: 'casa', icon: 'archive', freq: M(1), mins: 45 },
  { title: 'Ordenar la casa', group: 'casa', icon: 'sofa', freq: D(2), mins: 20 },
  { title: 'Fumigar', group: 'casa', icon: 'shield', freq: M(3), mins: 30 },
  { title: 'Cortarte el pelo', group: 'personal', icon: 'scissors', freq: M(1), mins: 45 },
  { title: 'Arreglarte las uñas', group: 'personal', icon: 'sparkle', freq: W(2), mins: 30 },
  { title: 'Limpiar los zapatos', group: 'personal', icon: 'shirt', freq: W(2), mins: 15 },
  { title: 'Preparar la ropa de mañana', group: 'personal', icon: 'shirt', freq: D(1), mins: 5, attr: 'laborales' },
  { title: 'Lavar el carro', group: 'vehiculo', icon: 'car', freq: W(2), mins: 40 },
  { title: 'Revisar aceite y gomas', group: 'vehiculo', icon: 'wrench', freq: M(1), mins: 15 },
  { title: 'Bañar a la mascota', group: 'mascotas', icon: 'paw', freq: W(2), mins: 30 },
  { title: 'Comprar alimento de la mascota', group: 'mascotas', icon: 'paw', freq: M(1), mins: 20 },
  { title: 'Ir al banco o hacer diligencias', group: 'mandados', icon: 'bank', freq: W(2), mins: 60 },
];
export const CHORE_ICONS = ['shirt', 'iron', 'bed', 'broom', 'drop', 'trash', 'utensils', 'cart', 'sparkle', 'sofa', 'sprout', 'scissors', 'car', 'wrench', 'paw', 'bag', 'home', 'archive', 'flame', 'snow', 'bank', 'list'];
// XP por tarea del hogar: base más un poco por cada 10 minutos (hasta +10).
export const CHORE_XP = { base: 5, per10: 1, max: 10, gold: 2 };

// ---------- Sueño ----------

// Rutina para dormir: lo que ayuda a dormir mejor (se marca en la posada, al cerrar el día).
export const SLEEP_ROUTINE = [
  { key: 'pantallas', label: 'Sin pantallas 30 min antes', icon: 'eyeoff' },
  { key: 'cafeina', label: 'Sin café después de las 2 p. m.', icon: 'flask' },
  { key: 'cena', label: 'Cena ligera y temprano', icon: 'utensils' },
  { key: 'cuarto', label: 'Cuarto oscuro, fresco y callado', icon: 'moon' },
  { key: 'hora', label: 'A la misma hora de siempre', icon: 'clock' },
  { key: 'manana', label: 'Dejé listo lo de mañana', icon: 'list' },
];
export const SLEEP_QUALITY = [
  { v: 1, label: 'Mal' },
  { v: 2, label: 'Regular' },
  { v: 3, label: 'Bien' },
  { v: 4, label: 'Muy bien' },
];
// Lo que se tarda en quedarse dormido (para la hora sugerida de acostarse).
export const SLEEP_LATENCY_MIN = 15;

// ---------- Ejercicio ----------

// `intensity`: la que se propone al registrarla (1.10). `strength`: trabaja fuerza (la OMS pide 2 días a la semana).
export const EXERCISE_TYPES = [
  { key: 'caminar', label: 'Caminar', icon: 'pulse', intensity: 'moderada' },
  { key: 'correr', label: 'Correr', icon: 'bolt', intensity: 'intensa' },
  { key: 'gimnasio', label: 'Gimnasio o pesas', icon: 'dumbbell', intensity: 'moderada', strength: true },
  { key: 'bici', label: 'Bicicleta', icon: 'sync', intensity: 'moderada' },
  { key: 'deporte', label: 'Deporte', icon: 'trophy', intensity: 'intensa' },
  { key: 'baile', label: 'Baile', icon: 'sparkle', intensity: 'moderada' },
  { key: 'yoga', label: 'Yoga o estiramiento', icon: 'heart', intensity: 'moderada' },
  { key: 'otro', label: 'Otro', icon: 'plus', intensity: 'moderada' },
];
// La OMS recomienda al menos 150 minutos de actividad moderada a la semana para adultos.
export const EXERCISE_WEEK_GOAL = 150;

// ---------- Logros (profesionales, académicos y personales) ----------

export const WIN_SCOPES = [
  { key: 'profesional', label: 'Profesional', area: 'laborales' },
  { key: 'academico', label: 'Académico', area: 'crecimiento' },
  { key: 'personal', label: 'Personal', area: null },
];
export const WIN_TYPES = [
  { key: 'entrega', label: 'Entrega o proyecto', icon: 'flag' },
  { key: 'meta', label: 'Meta cumplida', icon: 'target' },
  { key: 'mejora', label: 'Mejora de un proceso', icon: 'chart' },
  { key: 'reconocimiento', label: 'Reconocimiento', icon: 'trophy' },
  { key: 'feedback', label: 'Comentario positivo', icon: 'chat' },
  { key: 'liderazgo', label: 'Liderazgo o mentoría', icon: 'people' },
  { key: 'presentacion', label: 'Presentación o publicación', icon: 'mic' },
  { key: 'aprendizaje', label: 'Curso, certificación o nota', icon: 'cap' },
  { key: 'rol', label: 'Ascenso o nuevo rol', icon: 'crown' },
  { key: 'otro', label: 'Otro logro', icon: 'star' },
];
export const WIN_SKILLS = ['Liderazgo', 'Comunicación', 'Trabajo en equipo', 'Análisis de datos', 'Gestión de proyectos', 'Mejora continua', 'Planificación', 'Innovación', 'Orientación a resultados', 'Servicio', 'Negociación', 'Tecnología', 'Gestión del talento', 'Redacción'];
export const WIN_XP = { xp: 20, gold: 5, daily: 3 };

// ---------- Expediente personal ----------

// Formas de las listas del expediente: qué pide cada registro y qué fecha avisa.
export const RECORD_SCHEMAS = {
  docs: { item: 'documento', items: 'documentos', labels: { title: 'Documento', detail: 'Número (opcional)', end: 'Vence' }, suggest: ['Cédula', 'Pasaporte', 'Licencia de conducir', 'Seguro médico', 'Seguro del vehículo', 'Marbete', 'Visa'], alert: 'Vence', secretDetail: true },
  checkups: { item: 'chequeo', items: 'chequeos', labels: { title: 'Chequeo', detail: 'Médico o lugar', start: 'Último', end: 'Próximo' }, suggest: ['Chequeo general', 'Odontólogo', 'Oftalmólogo', 'Análisis de sangre', 'Ginecólogo', 'Dermatólogo'], alert: 'Próximo' },
  contacts: { item: 'contacto', items: 'contactos', labels: { title: 'Nombre', detail: 'Parentesco', phone: 'Teléfono' }, suggest: ['Mamá', 'Papá', 'Pareja', 'Hermano', 'Hermana'] },
  study: { item: 'estudio', items: 'estudios', labels: { title: 'Título o curso', detail: 'Institución', start: 'Desde', end: 'Hasta' }, suggest: ['Licenciatura', 'Maestría', 'Diplomado', 'Certificación', 'Curso'] },
  jobs: { item: 'puesto', items: 'puestos', labels: { title: 'Puesto', detail: 'Institución', start: 'Desde', end: 'Hasta (vacío si es el actual)', note: 'Logros y funciones' } },
  assets: { item: 'registro', items: 'registros', labels: { title: 'Cuenta, seguro o bien', detail: 'Entidad o últimos 4 dígitos', end: 'Vence o se renueva', note: 'Nota' }, suggest: ['Cuenta de ahorro', 'Tarjeta de crédito', 'Préstamo', 'AFP', 'Seguro de vida', 'Seguro de la casa', 'Vehículo', 'Inmueble'], alert: 'Vence', secretDetail: true, last4: true, hint: 'Anota solo los últimos 4 dígitos. Si escribes un número completo, guardo solo el final. Nunca guardes claves ni PIN.' },
  milestones: { item: 'hito', items: 'hitos', labels: { title: 'Logro o hito', start: 'Fecha', note: 'Nota' } },
  generic: { item: 'registro', items: 'registros', labels: { title: 'Nombre', detail: 'Detalle', start: 'Fecha', end: 'Vence o próxima fecha', note: 'Nota' }, alert: 'Fecha clave' },
};

// Secciones con las que empieza el expediente. [etiqueta, tipo, oculto]
export const RECORD_SECTIONS = [
  { id: 'datos', kind: 'fields', icon: 'user', title: 'Datos personales', area: null, fields: [['Nombre completo'], ['Fecha de nacimiento', 'date'], ['Cédula', 'text', true], ['Teléfono', 'tel'], ['Correo', 'email'], ['Dirección'], ['Estado civil'], ['Profesión u ocupación']] },
  { id: 'documentos', kind: 'list', schema: 'docs', icon: 'idcard', title: 'Documentos y vencimientos', area: null },
  { id: 'salud', kind: 'fields', icon: 'heart', title: 'Salud', area: 'salud', fields: [['Tipo de sangre'], ['Alergias', 'long'], ['Condiciones', 'long'], ['Medicamentos', 'long'], ['Médico de cabecera'], ['Seguro médico (ARS)'], ['Número de afiliado', 'text', true]] },
  { id: 'chequeos', kind: 'list', schema: 'checkups', icon: 'pulse', title: 'Chequeos médicos', area: 'salud' },
  { id: 'emergencia', kind: 'list', schema: 'contacts', icon: 'phone', title: 'Contactos de emergencia', area: 'relaciones' },
  { id: 'formacion', kind: 'list', schema: 'study', icon: 'cap', title: 'Formación y certificaciones', area: 'crecimiento' },
  { id: 'trayectoria', kind: 'list', schema: 'jobs', icon: 'briefcase', title: 'Trayectoria laboral', area: 'laborales' },
  { id: 'patrimonio', kind: 'list', schema: 'assets', icon: 'coins', title: 'Cuentas, seguros y bienes', area: 'finanzas' },
  { id: 'hitos', kind: 'list', schema: 'milestones', icon: 'flag', title: 'Logros e hitos', area: null },
  { id: 'proposito', kind: 'fields', icon: 'sparkle', title: 'Quién soy', area: 'emocional', fields: [['Mi propósito', 'long'], ['Mis valores', 'long'], ['Mis fortalezas', 'long'], ['Lo que quiero mejorar', 'long'], ['Cómo me veo en 5 años', 'long']] },
];
export const RECORD_ICONS = ['note', 'folder', 'idcard', 'heart', 'home', 'coins', 'car', 'cap', 'briefcase', 'people', 'flag', 'star'];
export const RECORD_XP = { field: 3, item: 5, dailyCap: 60 };

export const INTENSITIES = [
  { key: 'suave', label: 'Suave', energy: 2, missions: 1 },
  { key: 'normal', label: 'Normal', energy: 3, missions: 2 },
  { key: 'intensa', label: 'Intensa', energy: 5, missions: 3 },
];

// Talentos: cada uno suma +5 % de XP en su atributo.
export const TALENTS = {
  salud: ['Madrugador', 'Pulmones de acero', 'Cuerpo en equilibrio'],
  emocional: ['Respiración serena', 'Mente en calma', 'Temple de roble'],
  relaciones: ['Buen oído', 'Anfitrión', 'Corazón presente'],
  crecimiento: ['Curioso', 'Lector voraz', 'Erudito'],
  finanzas: ['Contador', 'Ahorrador', 'Estratega del dinero'],
  laborales: ['Enfocado', 'Mano firme', 'Maestro artesano'],
};
export const TALENT_LEVELS = [5, 10, 15];

// Pociones: acciones reales que recargan. Límite por día.
export const POTIONS = [
  { id: 'siesta', icon: 'moon', title: 'Siesta de 20 minutos', effect: { energy: 2 }, perDay: 1 },
  { id: 'pausa', icon: 'flask', title: 'Pausa sin pantalla (10 min)', effect: { energy: 1 }, perDay: 2 },
  { id: 'comida', icon: 'heart', title: 'Comida casera y tranquila', effect: { vit: 5 }, perDay: 1 },
  { id: 'aire', icon: 'sun', title: '10 minutos al aire libre', effect: { vit: 3, energy: 1 }, perDay: 1 },
];

export const SHOP_ITEMS = [
  { id: 'protector', icon: 'shield', title: 'Protector de racha', desc: 'Cuida tu racha un día que no puedas.', cost: 120, max: 3 },
  { id: 'pocion', icon: 'drop', title: 'Poción de vitalidad', desc: '+20 de vitalidad al instante. Una por día.', cost: 90 },
];

export const DEFAULT_REWARDS = [
  { title: 'Una tarde de cine', cost: 150 },
  { title: 'Una hora de videojuegos sin culpa', cost: 80 },
  { title: 'Cena fuera', cost: 300 },
];

export const RECOVERY_QUESTS = [
  { id: 'agua', icon: 'drop', title: 'Bebe dos vasos de agua' },
  { id: 'sol', icon: 'sun', title: 'Sal 10 minutos al sol' },
  { id: 'alguien', icon: 'people', title: 'Escríbele a alguien que quieres' },
];

// Check-in de ánimo: cuadrantes (energía × agrado).
export const MOOD_QUADS = [
  { key: 0, label: 'Tenso', desc: 'Mucha energía · desagradable', tone: 'q-red', words: ['Estrés', 'Ansiedad', 'Preocupación', 'Frustración', 'Irritación', 'Agobio', 'Nervios', 'Enojo'] },
  { key: 1, label: 'Animado', desc: 'Mucha energía · agradable', tone: 'q-yellow', words: ['Alegría', 'Motivación', 'Entusiasmo', 'Ganas', 'Optimismo', 'Orgullo', 'Emoción', 'Inspiración'] },
  { key: 2, label: 'Bajo', desc: 'Poca energía · desagradable', tone: 'q-blue', words: ['Cansancio', 'Tristeza', 'Desánimo', 'Agotamiento', 'Aburrimiento', 'Soledad', 'Decepción', 'Apatía'] },
  { key: 3, label: 'Tranquilo', desc: 'Poca energía · agradable', tone: 'q-green', words: ['Calma', 'Gratitud', 'Paz', 'Satisfacción', 'Relajación', 'Serenidad', 'Bienestar', 'Esperanza'] },
];
export const INFLUENCES = [
  { key: 'familia', label: 'Familia', icon: 'people' },
  { key: 'amigos', label: 'Amistades', icon: 'chat' },
  { key: 'trabajo', label: 'Trabajo', icon: 'briefcase' },
  { key: 'dinero', label: 'Dinero', icon: 'coins' },
  { key: 'ejercicio', label: 'Ejercicio', icon: 'pulse' },
  { key: 'sueno', label: 'Dormí poco', icon: 'moon' },
  { key: 'salud', label: 'Salud', icon: 'heart' },
  { key: 'pareja', label: 'Pareja', icon: 'heart' },
  { key: 'estudio', label: 'Estudio', icon: 'book' },
  { key: 'tareas', label: 'Tareas y pendientes', icon: 'list' },
  { key: 'descanso', label: 'Descanso', icon: 'bed' },
  { key: 'autocuidado', label: 'Autocuidado', icon: 'sparkle' },
  { key: 'comida', label: 'Comida', icon: 'utensils' },
  { key: 'pantallas', label: 'Pantallas y redes', icon: 'phone' },
  { key: 'hogar', label: 'Casa', icon: 'home' },
  { key: 'pasatiempos', label: 'Pasatiempos', icon: 'star' },
  { key: 'espiritualidad', label: 'Fe o espiritualidad', icon: 'sun' },
  { key: 'comunidad', label: 'Comunidad', icon: 'people' },
  { key: 'clima', label: 'Clima', icon: 'cloud' },
  { key: 'noticias', label: 'Noticias', icon: 'mail' },
  { key: 'viajes', label: 'Viajes', icon: 'plane' },
];

export const CIRCLES = ['Familia', 'Amistad', 'Pareja', 'Trabajo', 'Otro'];

// ---------- Finanzas ----------

// Familias de categorías: ordenan los selectores y el presupuesto.
export const CATEGORY_GROUPS = [
  { id: 'comida', name: 'Comida' },
  { id: 'transporte', name: 'Transporte' },
  { id: 'casa', name: 'Casa' },
  { id: 'personal', name: 'Personal' },
  { id: 'ocio', name: 'Ocio y compras' },
  { id: 'familia', name: 'Familia y otros' },
  { id: 'dinero', name: 'Dinero' },
  { id: 'otros', name: 'Otros' },
  { id: 'ingresos', name: 'Ingresos' },
  { id: 'movimientos', name: 'Entre tus cuentas' },
];

// `type`: gasto (cuenta en el presupuesto), ingreso o transfer (mover dinero entre tus cuentas o
// pagar una tarjeta: no es un gasto nuevo, porque las compras ya se cuentan una por una).
// Los ids de la versión 1 se conservan (super, transporte, comida, servicios, hogar, salud, educacion,
// ocio, deuda, ahorro, otros) para que los movimientos viejos sigan en su lugar.
export const CATEGORIES = [
  { id: 'super', name: 'Supermercado y colmado', group: 'comida', icon: 'cart', type: 'gasto', budget: 0 },
  { id: 'comida', name: 'Restaurantes y comida fuera', group: 'comida', icon: 'utensils', type: 'gasto', budget: 0 },
  { id: 'cafe', name: 'Café, panadería y antojos', group: 'comida', icon: 'coffee', type: 'gasto', budget: 0 },
  { id: 'delivery', name: 'Delivery y pedidos', group: 'comida', icon: 'box', type: 'gasto', budget: 0 },
  { id: 'bebidas', name: 'Bebidas, licores y tabaco', group: 'comida', icon: 'glass', type: 'gasto', budget: 0 },
  { id: 'combustible', name: 'Combustible', group: 'transporte', icon: 'fuel', type: 'gasto', budget: 0 },
  { id: 'transporte', name: 'Taxi, Uber y pasajes', group: 'transporte', icon: 'bus', type: 'gasto', budget: 0 },
  { id: 'peajes', name: 'Peajes y parqueos', group: 'transporte', icon: 'parking', type: 'gasto', budget: 0 },
  { id: 'vehiculo', name: 'Vehículo: taller y repuestos', group: 'transporte', icon: 'wrench', type: 'gasto', budget: 0 },
  { id: 'vivienda', name: 'Alquiler o hipoteca', group: 'casa', icon: 'home', type: 'gasto', budget: 0 },
  { id: 'servicios', name: 'Luz y agua', group: 'casa', icon: 'bolt', type: 'gasto', budget: 0 },
  { id: 'gas', name: 'Gas de cocina', group: 'casa', icon: 'flame', type: 'gasto', budget: 0 },
  { id: 'agua_botellon', name: 'Botellones de agua', group: 'casa', icon: 'drop', type: 'gasto', budget: 0 },
  { id: 'energia', name: 'Inversor, planta y paneles', group: 'casa', icon: 'plug', type: 'gasto', budget: 0 },
  { id: 'telecom', name: 'Internet, cable y celular', group: 'casa', icon: 'wifi', type: 'gasto', budget: 0 },
  { id: 'hogar', name: 'Hogar y mantenimiento', group: 'casa', icon: 'sofa', type: 'gasto', budget: 0 },
  { id: 'muebles', name: 'Muebles y electrodomésticos', group: 'casa', icon: 'sofa', type: 'gasto', budget: 0 },
  { id: 'domestico', name: 'Ayuda doméstica', group: 'casa', icon: 'broom', type: 'gasto', budget: 0 },
  { id: 'ropa', name: 'Ropa y calzado', group: 'personal', icon: 'shirt', type: 'gasto', budget: 0 },
  { id: 'cuidado', name: 'Cuidado personal', group: 'personal', icon: 'scissors', type: 'gasto', budget: 0 },
  { id: 'salud', name: 'Médicos, análisis y dentista', group: 'personal', icon: 'pulse', type: 'gasto', budget: 0 },
  { id: 'farmacia', name: 'Farmacia y medicinas', group: 'personal', icon: 'pill', type: 'gasto', budget: 0 },
  { id: 'terapia', name: 'Terapia y bienestar', group: 'personal', icon: 'heart', type: 'gasto', budget: 0 },
  { id: 'deporte', name: 'Deporte y gimnasio', group: 'personal', icon: 'dumbbell', type: 'gasto', budget: 0 },
  { id: 'educacion', name: 'Colegio y universidad', group: 'personal', icon: 'cap', type: 'gasto', budget: 0 },
  { id: 'cursos', name: 'Cursos y certificaciones', group: 'personal', icon: 'flag', type: 'gasto', budget: 0 },
  { id: 'libros', name: 'Libros y aprendizaje', group: 'personal', icon: 'book', type: 'gasto', budget: 0 },
  { id: 'ocio', name: 'Entretenimiento y salidas', group: 'ocio', icon: 'ticket', type: 'gasto', budget: 0 },
  { id: 'viajes', name: 'Viajes y hospedaje', group: 'ocio', icon: 'plane', type: 'gasto', budget: 0 },
  { id: 'compras', name: 'Tiendas y compras varias', group: 'ocio', icon: 'bag', type: 'gasto', budget: 0 },
  { id: 'tecnologia', name: 'Tecnología', group: 'ocio', icon: 'laptop', type: 'gasto', budget: 0 },
  { id: 'suscripciones', name: 'Suscripciones y apps', group: 'ocio', icon: 'play', type: 'gasto', budget: 0 },
  { id: 'regalos', name: 'Regalos y celebraciones', group: 'ocio', icon: 'gift', type: 'gasto', budget: 0 },
  { id: 'hobbies', name: 'Pasatiempos y videojuegos', group: 'ocio', icon: 'star', type: 'gasto', budget: 0 },
  { id: 'loteria', name: 'Lotería y apuestas', group: 'ocio', icon: 'dice', type: 'gasto', budget: 0 },
  { id: 'familia', name: 'Apoyo familiar', group: 'familia', icon: 'people', type: 'gasto', budget: 0 },
  { id: 'hijos', name: 'Hijos: cuido, ropa y actividades', group: 'familia', icon: 'baby', type: 'gasto', budget: 0 },
  { id: 'mascotas', name: 'Mascotas', group: 'familia', icon: 'paw', type: 'gasto', budget: 0 },
  { id: 'donaciones', name: 'Donaciones', group: 'familia', icon: 'heart', type: 'gasto', budget: 0 },
  { id: 'terceros', name: 'Transferencias a terceros', group: 'familia', icon: 'send', type: 'gasto', budget: 0 },
  { id: 'prestamo_dado', name: 'Préstamos que das', group: 'familia', icon: 'coins', type: 'gasto', budget: 0 },
  { id: 'deuda', name: 'Pago de deuda', group: 'dinero', icon: 'card', type: 'gasto', budget: 0 },
  { id: 'ahorro', name: 'Ahorro', group: 'dinero', icon: 'piggy', type: 'gasto', budget: 0 },
  { id: 'inversion', name: 'Inversiones', group: 'dinero', icon: 'trend', type: 'gasto', budget: 0 },
  { id: 'seguros', name: 'Seguros', group: 'dinero', icon: 'shield', type: 'gasto', budget: 0 },
  { id: 'impuestos', name: 'Impuestos y trámites', group: 'dinero', icon: 'receipt', type: 'gasto', budget: 0 },
  { id: 'comisiones', name: 'Comisiones e impuestos del banco', group: 'dinero', icon: 'percent', type: 'gasto', budget: 0 },
  { id: 'intereses_pagados', name: 'Intereses y cargos por mora', group: 'dinero', icon: 'percent', type: 'gasto', budget: 0 },
  { id: 'trabajo', name: 'Trabajo y negocio', group: 'dinero', icon: 'briefcase', type: 'gasto', budget: 0 },
  { id: 'imprevistos', name: 'Imprevistos y emergencias', group: 'otros', icon: 'info', type: 'gasto', budget: 0 },
  { id: 'otros', name: 'Otros gastos', group: 'otros', icon: 'dots', type: 'gasto', budget: 0 },
  { id: 'ajuste', name: 'Gastos sin anotar (ajuste de saldo)', group: 'otros', icon: 'search', type: 'gasto', budget: 0 },
  { id: 'salario', name: 'Salario', group: 'ingresos', icon: 'briefcase', type: 'ingreso', budget: 0 },
  { id: 'regalia', name: 'Regalía pascual', group: 'ingresos', icon: 'gift', type: 'ingreso', budget: 0 },
  { id: 'bonos', name: 'Bonos, incentivos y comisiones', group: 'ingresos', icon: 'star', type: 'ingreso', budget: 0 },
  { id: 'honorarios', name: 'Honorarios y trabajos extra', group: 'ingresos', icon: 'edit', type: 'ingreso', budget: 0 },
  { id: 'ventas', name: 'Ventas y negocio', group: 'ingresos', icon: 'bag', type: 'ingreso', budget: 0 },
  { id: 'alquileres', name: 'Alquileres que cobras', group: 'ingresos', icon: 'home', type: 'ingreso', budget: 0 },
  { id: 'pension', name: 'Pensión y jubilación', group: 'ingresos', icon: 'piggy', type: 'ingreso', budget: 0 },
  { id: 'remesas', name: 'Remesas y dinero recibido', group: 'ingresos', icon: 'download', type: 'ingreso', budget: 0 },
  { id: 'intereses', name: 'Intereses y rendimientos', group: 'ingresos', icon: 'chart', type: 'ingreso', budget: 0 },
  { id: 'reembolsos', name: 'Reembolsos y devoluciones', group: 'ingresos', icon: 'undo', type: 'ingreso', budget: 0 },
  { id: 'prestamo_cobrado', name: 'Préstamos que te devuelven', group: 'ingresos', icon: 'coins', type: 'ingreso', budget: 0 },
  { id: 'prestamo_recibido', name: 'Préstamos que te hacen', group: 'ingresos', icon: 'coins', type: 'ingreso', budget: 0 },
  { id: 'ajuste_ingreso', name: 'Ingresos sin anotar (ajuste de saldo)', group: 'ingresos', icon: 'search', type: 'ingreso', budget: 0 },
  { id: 'premios', name: 'Premios y cashback', group: 'ingresos', icon: 'trophy', type: 'ingreso', budget: 0 },
  { id: 'ingreso', name: 'Otros ingresos', group: 'ingresos', icon: 'coins', type: 'ingreso', budget: 0 },
  { id: 'pago_tarjeta', name: 'Pago de tarjeta', group: 'movimientos', icon: 'card', type: 'transfer', budget: 0 },
  { id: 'entre_cuentas', name: 'Entre tus cuentas', group: 'movimientos', icon: 'swap', type: 'transfer', budget: 0 },
  { id: 'retiro', name: 'Retiro de efectivo', group: 'movimientos', icon: 'cash', type: 'transfer', budget: 0 },
];

// Pagos y cobros programados (1.5). `freq`: mensual (día), quincenal (días 15 y último), anual (mes y día) o una vez.
// Los anuales y los de una sola vez se ven como «pagos futuros»: la app dice cuánto apartar cada mes.
export const PLAN_TEMPLATES = {
  ingreso: [
    { name: 'Sueldo', cat: 'salario', icon: 'briefcase', freq: 'quincenal' },
    { name: 'Honorarios', cat: 'honorarios', icon: 'edit', freq: 'mensual', day: 30 },
    { name: 'Remesa', cat: 'remesas', icon: 'download', freq: 'mensual', day: 1 },
    { name: 'Alquiler que cobro', cat: 'alquileres', icon: 'home', freq: 'mensual', day: 1 },
    { name: 'Regalía pascual', cat: 'regalia', icon: 'gift', freq: 'anual', md: '12-20' },
  ],
  gasto: [
    { name: 'Alquiler o hipoteca', cat: 'vivienda', icon: 'home', freq: 'mensual', day: 1 },
    { name: 'Luz', cat: 'servicios', icon: 'bolt', freq: 'mensual', day: 15, variable: true },
    { name: 'Agua', cat: 'servicios', icon: 'drop', freq: 'mensual', day: 15, variable: true },
    { name: 'Gas de cocina', cat: 'gas', icon: 'flame', freq: 'mensual', day: 20, variable: true },
    { name: 'Internet y cable', cat: 'telecom', icon: 'wifi', freq: 'mensual', day: 10 },
    { name: 'Celular', cat: 'telecom', icon: 'phone', freq: 'mensual', day: 10 },
    { name: 'Seguro médico', cat: 'seguros', icon: 'shield', freq: 'mensual', day: 5 },
    { name: 'Colegio', cat: 'educacion', icon: 'cap', freq: 'mensual', day: 5 },
    { name: 'Préstamo', cat: 'deuda', icon: 'card', freq: 'mensual', day: 15 },
    { name: 'Cuido o guardería', cat: 'hijos', icon: 'baby', freq: 'mensual', day: 1 },
    { name: 'Inversión mensual', cat: 'inversion', icon: 'trend', freq: 'mensual', day: 16 },
    { name: 'Gimnasio', cat: 'deporte', icon: 'dumbbell', freq: 'mensual', day: 1 },
    { name: 'Streaming', cat: 'suscripciones', icon: 'play', freq: 'mensual', day: 1 },
    { name: 'Ayuda doméstica', cat: 'domestico', icon: 'broom', freq: 'quincenal' },
    { name: 'Marbete', cat: 'impuestos', icon: 'receipt', freq: 'anual', md: '01-31' },
    { name: 'Seguro del carro', cat: 'seguros', icon: 'car', freq: 'anual', md: '03-15' },
    { name: 'Inscripción del colegio', cat: 'educacion', icon: 'cap', freq: 'anual', md: '08-01' },
    { name: 'Navidad y regalos', cat: 'regalos', icon: 'gift', freq: 'anual', md: '12-20' },
  ],
};

// Íconos para las categorías que crees.
export const CATEGORY_ICONS = ['tag', 'cart', 'utensils', 'coffee', 'home', 'car', 'heart', 'gift', 'people', 'baby', 'bag', 'briefcase', 'cap', 'book', 'plane', 'paw', 'shirt', 'laptop', 'coins', 'trend', 'star', 'glass', 'dice', 'box'];

// Palabras que sugieren la categoría de un gasto (sin tildes, en minúscula). Gana la coincidencia más larga.
// Con «~» delante se busca dentro de la palabra («CENTROPARKINGMAQ» contiene «parking»).
export const CATEGORY_WORDS = {
  cafe: ['cafe', 'coffee', 'cafeteria', 'starbucks', 'juan valdez', 'dunkin', 'krispy kreme', 'panaderia', 'bakery', 'reposteria', 'pasteleria', 'helado', 'heladeria', 'yogen fruz', 'dulceria', 'antojo', 'jugo', 'batida'],
  delivery: ['delivery', 'pedidosya', 'pedidos ya', 'uber eats', 'rappi', 'hugo app', 'glovo', 'pedido a domicilio', 'a domicilio'],
  bebidas: ['licor', 'licoreria', 'drink', 'drinks', 'bebida', 'bebidas', 'cerveza', 'ron', 'vino', 'whisky', 'vodka', 'cigarrillo', 'cigarrillos', 'cigarro', 'tabaco', 'vape', 'hookah', 'hooka', 'bar de vinos'],
  gas: ['gas propano', 'glp', 'tropigas', 'propagas', 'gas de cocina', 'envasadora', 'tanque de gas'],
  agua_botellon: ['botellon', 'botellones', 'planeta azul', 'agua crystal', 'agua cristal', 'agua de botellon'],
  energia: ['inversor', 'planta electrica', 'bateria de inversor', 'baterias del inversor', 'panel solar', 'paneles solares'],
  muebles: ['mueble', 'muebles', 'muebleria', 'nevera', 'estufa', 'lavadora', 'secadora', 'microondas', 'aire acondicionado', 'abanico', 'colchon', 'electrodomestico', 'la curacao', 'corripio'],
  farmacia: ['farmacia', 'medicina', 'medicinas', 'medicamento', 'pharmacy', 'cvs', 'walgreens', 'farmacity', 'farmacia carol', 'los hidalgos', 'farmax', 'vitaminas'],
  terapia: ['psicolog', 'psicologo', 'psicologa', 'terapia', 'terapeuta', 'masaje', 'masajes', 'coaching', 'fisioterapia', 'acupuntura'],
  cursos: ['curso', 'cursos', 'diplomado', 'certificacion', 'udemy', 'coursera', 'platzi', 'domestika', 'bootcamp', 'seminario', 'congreso'],
  libros: ['libro', 'libros', 'libreria', 'kindle', 'audible', 'cuesta libros', 'revista', 'ebook'],
  hobbies: ['juego', 'videojuego', 'playstation', 'xbox', 'nintendo', 'steam', 'hobby', 'pasatiempo', 'instrumento', 'guitarra', 'pesca', 'manualidades', 'lego'],
  loteria: ['loteria', 'banca de loteria', 'apuesta', 'apuestas', 'casino', 'quiniela', 'loto', 'leidsa', 'lotka'],
  hijos: ['panales', 'guarderia', 'estancia infantil', 'cuido', 'juguete', 'juguetes', 'jugueteria', 'campamento', 'pediatra', 'uniforme', 'bebe'],
  prestamo_dado: ['le preste', 'preste', 'prestamo a', 'le di prestado'],
  inversion: ['inversion', 'invertir', 'fondo de inversion', 'puesto de bolsa', 'acciones', 'bolsa de valores', 'cripto', 'bitcoin', 'binance'],
  intereses_pagados: ['intereses', 'interes', 'cargo por mora', 'recargo', 'penalidad', 'mora'],
  imprevistos: ['emergencia', 'imprevisto', 'urgencia'],
  super: ['super', 'supermercado', 'colmado', 'mercado', 'bravo', 'sirena', 'nacional', 'jumbo', 'ole', 'plaza lama', 'pricesmart', 'carrefour', 'minimarket', 'mini market', 'market', 'supermarket', 'bodega', 'walmart', 'costco', 'econo', 'compras de la casa', 'frutas', 'carniceria', 'pescaderia', 'aprezio'],
  comida: ['restaurante', 'restaurant', 'rest', 'comida', 'almuerzo', 'cena', 'desayuno', 'pizza', 'pica pollo', 'burger', 'bbq', 'grill', 'wendys', 'wendy', 'mcdonald', 'burger king', 'kfc', 'chilis', 'dominos', 'papa john', 'subway', 'taco', 'sushi', 'chimi', 'friteria', 'pollo', 'bistro', 'kitchen', 'diner', 'food', 'cocina', 'empanada'],
  combustible: ['gasolina', 'combustible', 'gas station', 'gasolinera', 'fuel', 'estacion', 'bomba', 'shell', 'texaco', 'esso', 'mobil', 'gulf', 'puma', 'sunix', 'diesel', 'gasoil'],
  transporte: ['uber', 'taxi', 'guagua', 'metro', 'teleferico', 'didi', 'indrive', 'cabify', 'lyft', 'pasaje', 'autobus', 'caribe tours', 'metro tours', 'motoconcho', 'omsa', 'transporte'],
  peajes: ['peaje', 'paso rapido', 'parqueo', 'parking', '~parking', 'estacionamiento', 'autoexpreso', 'valet'],
  vehiculo: ['taller', 'repuesto', 'gomas', 'goma', 'neumatico', 'lavado', 'car wash', 'mecanico', 'cambio de aceite', 'alineacion', 'auto parts', 'autozone', 'gomero', 'grua'],
  vivienda: ['alquiler', 'renta de la casa', 'hipoteca', 'condominio', 'mantenimiento del edificio'],
  servicios: ['luz', 'edeeste', 'edesur', 'edenorte', 'electricidad', 'agua', 'caasd', 'coraasan', 'inapa', 'basura', 'factura de luz'],
  telecom: ['internet', 'telefono', 'celular', 'claro', 'altice', 'viva', 'wind telecom', 'cable', 'recarga', 'wifi', 'plan de datos'],
  hogar: ['ferreteria', 'limpieza', 'home depot', 'ikea', 'lavanderia', 'cerrajero', 'plomero', 'electricista', 'utensilios', 'decoracion', 'casa cuesta', 'ochoa', 'hogar', 'pintura'],
  domestico: ['empleada', 'domestica', 'nana', 'nanny', 'jardinero', 'conserje', 'limpiadora', 'muchacha'],
  ropa: ['ropa', 'zapato', 'zapatos', 'calzado', 'tenis', 'burlington', 'tj maxx', 't j maxx', 'marshalls', 'ross', 'zara', 'h&m', 'tommy', 'hilfiger', 'nike', 'adidas', 'forever 21', 'old navy', 'gap', 'levis', 'carters', 'payless', 'bershka', 'pull and bear', 'macys', 'kohls', 'mango', 'shein', 'boutique'],
  cuidado: ['salon', 'peluqueria', 'barberia', 'barber', 'unas', 'manicure', 'pedicure', 'spa', 'cosmetico', 'maquillaje', 'perfume', 'sephora', 'ulta', 'cejas'],
  salud: ['medico', 'doctor', 'clinica', 'laboratorio', 'dentista', 'odontolog', 'hospital', 'optica', 'analisis', 'consulta'],
  deporte: ['gimnasio', 'gym', 'smart fit', 'body shop', 'crossfit', 'deporte', 'yoga', 'pilates', 'entrenador'],
  educacion: ['colegio', 'universidad', 'matricula', 'utiles', 'escuela', 'inscripcion', 'maestria', 'pucmm', 'intec', 'unibe', 'uasd', 'apec', 'unphu'],
  ocio: ['cine', 'cinema', 'caribbean cinemas', 'palacio del cine', 'salida', 'fiesta', 'bar', 'discoteca', 'concierto', 'teatro', 'boleta', 'boletas', 'entradas', 'ticket', 'parque', 'museo', 'bowling', 'trampolin', 'trampoline', 'excursion', 'karaoke', 'playa'],
  viajes: ['viaje', 'hotel', 'airbnb', 'hostal', 'resort', 'vuelo', 'aerolinea', 'airline', 'airlines', 'jetblue', 'american airlines', 'arajet', 'avianca', 'copa airlines', 'spirit airlines', 'delta air', 'united airlines', 'rent a car', 'rental', 'hertz', 'avis', 'enterprise', 'booking', 'expedia', 'aeropuerto', 'equipaje', 'hospedaje'],
  compras: ['amazon', 'aliexpress', 'temu', 'ebay', 'tienda', 'store', 'stores', 'plaza', 'mall', 'departamento', 'target', 'outlet', 'dollar', 'five below'],
  tecnologia: ['apple store', 'best buy', 'ofimatica', 'computadora', 'laptop', 'electronica', 'tecnologia', 'cargador', 'audifonos', 'samsung', 'tablet', 'impresora'],
  suscripciones: ['netflix', 'spotify', 'disney', 'hbo', 'hbo max', 'prime video', 'amazon prime', 'youtube premium', 'apple.com', 'icloud', 'google one', 'google storage', 'chatgpt', 'openai', 'claude', 'anthropic', 'microsoft', 'office 365', 'adobe', 'canva', 'suscripcion', 'membresia', 'paramount', 'crunchyroll'],
  regalos: ['regalo', 'cumpleanos', 'boda', 'baby shower', 'flores', 'floristeria', 'celebracion', 'aniversario'],
  familia: ['mami', 'mama', 'papi', 'papa', 'abuela', 'abuelo', 'hijo', 'hija', 'familia', 'hermano', 'hermana', 'tia', 'tio', 'pension alimenticia', 'manutencion', 'sobrino', 'sobrina'],
  mascotas: ['veterinaria', 'veterinario', 'mascota', 'perro', 'gato', 'petsmart', 'pet ', 'grooming', 'alimento para perro'],
  donaciones: ['donacion', 'diezmo', 'ofrenda', 'iglesia', 'caridad', 'fundacion'],
  terceros: ['transferencia a tercero', 'transferencia', 'envio de dinero'],
  deuda: ['prestamo', 'deuda', 'cuota', 'abono', 'financiamiento', 'financiera'],
  ahorro: ['ahorro', 'ahorre', 'certificado', 'aporte voluntario'],
  seguros: ['seguro', 'poliza', 'mapfre', 'universal', 'humano', 'senasa', 'ars', 'palic', 'seguros reservas', 'la colonial', 'sura'],
  impuestos: ['dgii', 'marbete', 'pasaporte', 'licencia', 'cedula', 'tramite', 'notario', 'legalizacion', 'multa', 'amet', 'intrant', 'impuesto sobre la renta', 'ipi'],
  comisiones: ['comision', 'cargo por servicio', 'cargo bancario', 'membresia de tarjeta', 'impuesto 0.15', 'impuesto de transferencia', 'retencion', 'cargo anual'],
  trabajo: ['oficina', 'papeleria', 'coworking', 'imprenta', 'negocio', 'proveedor', 'materiales'],
};

// Lo mismo para ingresos.
export const INCOME_WORDS = {
  salario: ['salario', 'sueldo', 'nomina', 'quincena', 'pago de nomina', 'mesada'],
  honorarios: ['honorario', 'honorarios', 'freelance', 'consultoria', 'chiripa', 'trabajo extra', 'servicio profesional'],
  ventas: ['venta', 'vendi', 'cliente', 'negocio', 'ventas'],
  remesas: ['remesa', 'western union', 'envio recibido', 'transferencia recibida', 'me enviaron', 'caribe express', 'vimenca'],
  intereses: ['interes', 'intereses', 'dividendo', 'rendimiento', 'cupon'],
  reembolsos: ['reembolso', 'devolucion', 'reverso', 'reintegro'],
  regalia: ['regalia', 'regalia pascual', 'doble sueldo', 'salario 13'],
  bonos: ['bono', 'bonificacion', 'incentivo', 'comision de venta', 'bono vacacional', 'utilidades'],
  alquileres: ['alquiler cobrado', 'inquilino', 'renta cobrada', 'cobro de alquiler'],
  pension: ['pension', 'jubilacion', 'afp'],
  prestamo_cobrado: ['me devolvio', 'devolucion de prestamo', 'me pago lo que le preste'],
  prestamo_recibido: ['me presto', 'me prestaron', 'prestamo de', 'me hizo un prestamo'],
  premios: ['premio', 'cashback', 'millas', 'puntos canjeados', 'sorteo', 'rifa'],
};

// Formas de pagar o de guardar el dinero.
export const ACCOUNT_KINDS = [
  { key: 'tarjeta', label: 'Tarjeta de crédito', icon: 'card' },
  { key: 'debito', label: 'Tarjeta de débito', icon: 'card' },
  { key: 'cuenta', label: 'Cuenta de banco', icon: 'bank' },
  { key: 'efectivo', label: 'Efectivo', icon: 'cash' },
];
export const DEFAULT_ACCOUNTS = [{ id: 'efectivo', name: 'Efectivo', kind: 'efectivo', bank: '', last4: '' }];

// Tasa del dólar cuando todavía no hay conexión: la oficial (DGII / Banco Central) del 15 de octubre de 2026.
// Con internet, la app la actualiza sola una vez al día.
export const FX_DEFAULT = { rate: 61.1477, day: '2026-10-15', source: 'Tasa oficial DGII' };

// Impuesto a los cheques y transferencias electrónicas (lo retiene el banco para la DGII), de la tasa más
// nueva a la más vieja. Sube de 0.15 % a 0.20 % el 3 de julio de 2026 (Ley 30-26). No pagan: lo que mueves
// entre tus cuentas (mismo banco o no), los retiros de efectivo, los pagos de impuestos al Estado,
// la Seguridad Social y los fondos de pensiones, ni las compras con tarjeta.
export const TRANSFER_TAX = [
  { from: '2026-07-03', rate: 0.002, label: '0.20 %', law: 'Ley 30-26' },
  { from: '1900-01-01', rate: 0.0015, label: '0.15 %', law: '' },
];
export const CURRENCIES = {
  DOP: { code: 'DOP', symbol: 'RD$', name: 'pesos', short: 'RD$' },
  USD: { code: 'USD', symbol: 'US$', name: 'dólares', short: 'US$' },
};

// Palabras que sugieren el atributo de una misión (sin tildes, en minúscula).
export const AREA_WORDS = {
  salud: ['camin', 'corr', 'entren', 'gym', 'gimnasio', 'pasos', 'dorm', 'sueno', 'agua', 'fruta', 'ensalada', 'vegetal', 'yoga', 'estir', 'bici', 'nad', 'medico', 'chequeo', 'vitamina', 'ejercicio', 'pesas', 'deporte', 'cocina', 'azucar', 'refresco', 'comer', 'dentista', 'odontolog', 'doctor', 'analisis', 'farmacia', 'medicina'],
  emocional: ['medit', 'respir', 'diario', 'gratitud', 'terapia', 'calma', 'relaj', 'ansiedad', 'estres', 'journal', 'sentir', 'emocion', 'pantalla', 'desconect', 'orar', 'silencio'],
  relaciones: ['llam', 'escrib', 'visit', 'mama', 'papa', 'amig', 'familia', 'pareja', 'hijo', 'hija', 'cena con', 'almuerzo con', 'cumple', 'whatsapp', 'abuel', 'herman', 'tio', 'prim', 'novi', 'esposa', 'esposo'],
  crecimiento: ['leer', 'lee', 'libro', 'pagina', 'curso', 'estudi', 'aprend', 'ingles', 'clase', 'podcast', 'practic', 'idioma', 'certific', 'tutorial', 'tarjetas', 'repas', 'python', 'excel', 'maestr', 'diplomado', 'matricul', 'tesis', 'tarea'],
  finanzas: ['gast', 'ahorr', 'presupuest', 'deuda', 'factur', 'banco', 'invers', 'dinero', 'recibo', 'tarjeta', 'prestamo', 'cuenta', 'compra', 'impulso', 'pago', 'pagar', 'marbete', 'impuesto', 'dgii', 'seguro'],
  laborales: ['informe', 'reunion', 'correo', 'email', 'proyecto', 'trabajo', 'oficina', 'presentacion', 'enfoque', 'pomodoro', 'cliente', 'entrega', 'agenda', 'jornada'],
};

export const TIPS = [
  'Las misiones pequeñas y diarias ganan a las grandes y ocasionales.',
  'Si tu energía está baja, elige una poción antes de rendirte con el día.',
  'Un jefe se vence a golpes pequeños. Registra cada avance, por mínimo que sea.',
  'Dormir tu meta es la misión con más retorno del juego.',
  'Cuando fallas un día, la regla es no fallar dos seguidos.',
  'Ponle nombre a lo que sientes: nombrarlo ya baja su intensidad.',
  'Escríbele hoy a alguien que te importa. Toma un minuto.',
];
