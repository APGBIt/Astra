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
      missions: [{ title: '5 minutos de respiración', cost: 1, feed: 'calm' }],
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
  { key: 0, label: 'Tenso', desc: 'Mucha energía · desagradable', tone: 'q-red', words: ['Estresado', 'Ansioso', 'Frustrado', 'Irritado', 'Preocupado', 'Abrumado', 'Molesto', 'Nervioso'] },
  { key: 1, label: 'Animado', desc: 'Mucha energía · agradable', tone: 'q-yellow', words: ['Motivado', 'Entusiasmado', 'Alegre', 'Orgulloso', 'Inspirado', 'Con ganas', 'Emocionado', 'Optimista'] },
  { key: 2, label: 'Bajo', desc: 'Poca energía · desagradable', tone: 'q-blue', words: ['Cansado', 'Triste', 'Desanimado', 'Aburrido', 'Solo', 'Agotado', 'Decepcionado', 'Apagado'] },
  { key: 3, label: 'Tranquilo', desc: 'Poca energía · agradable', tone: 'q-green', words: ['En calma', 'Agradecido', 'Satisfecho', 'Relajado', 'Cómodo', 'Esperanzado', 'En paz', 'Sereno'] },
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
];

export const CIRCLES = ['Familia', 'Amistad', 'Pareja', 'Trabajo', 'Otro'];

export const CATEGORIES = [
  { id: 'super', name: 'Supermercado', budget: 0 },
  { id: 'transporte', name: 'Transporte', budget: 0 },
  { id: 'comida', name: 'Comida fuera', budget: 0 },
  { id: 'servicios', name: 'Servicios', budget: 0 },
  { id: 'hogar', name: 'Hogar', budget: 0 },
  { id: 'salud', name: 'Salud', budget: 0 },
  { id: 'educacion', name: 'Educación', budget: 0 },
  { id: 'ocio', name: 'Ocio', budget: 0 },
  { id: 'deuda', name: 'Pago de deuda', budget: 0 },
  { id: 'ahorro', name: 'Ahorro', budget: 0 },
  { id: 'otros', name: 'Otros', budget: 0 },
];

// Palabras que sugieren la categoría de un gasto (sin tildes, en minúscula).
export const CATEGORY_WORDS = {
  super: ['super', 'supermercado', 'colmado', 'mercado', 'bravo', 'sirena', 'nacional', 'jumbo', 'ole', 'compras de la casa'],
  transporte: ['gasolina', 'combustible', 'uber', 'taxi', 'guagua', 'metro', 'peaje', 'parqueo', 'carro', 'estacion', 'bomba', 'didi', 'indrive'],
  comida: ['restaurante', 'comida', 'almuerzo', 'cena', 'desayuno', 'pizza', 'pica pollo', 'cafe', 'delivery', 'pedidosya', 'burger', 'helado'],
  servicios: ['luz', 'edeeste', 'edesur', 'edenorte', 'internet', 'telefono', 'claro', 'altice', 'agua', 'cable', 'netflix', 'spotify', 'suscripcion'],
  hogar: ['ferreteria', 'mueble', 'limpieza', 'alquiler', 'renta', 'hogar'],
  salud: ['farmacia', 'medico', 'doctor', 'clinica', 'laboratorio', 'medicina', 'seguro medico', 'dentista'],
  educacion: ['libro', 'curso', 'colegio', 'universidad', 'matricula', 'utiles'],
  ocio: ['cine', 'salida', 'fiesta', 'bar', 'juego', 'viaje', 'playa', 'concierto'],
  deuda: ['tarjeta', 'prestamo', 'deuda', 'cuota', 'abono'],
  ahorro: ['ahorro', 'ahorre', 'inversion', 'certificado'],
};

// Palabras que sugieren el atributo de una misión (sin tildes, en minúscula).
export const AREA_WORDS = {
  salud: ['camin', 'corr', 'entren', 'gym', 'gimnasio', 'pasos', 'dorm', 'sueno', 'agua', 'fruta', 'ensalada', 'vegetal', 'yoga', 'estir', 'bici', 'nad', 'medico', 'chequeo', 'vitamina', 'ejercicio', 'pesas', 'deporte', 'cocina', 'azucar', 'refresco', 'comer'],
  emocional: ['medit', 'respir', 'diario', 'gratitud', 'terapia', 'calma', 'relaj', 'ansiedad', 'estres', 'journal', 'sentir', 'emocion', 'pantalla', 'desconect', 'orar', 'silencio'],
  relaciones: ['llam', 'escrib', 'visit', 'mama', 'papa', 'amig', 'familia', 'pareja', 'hijo', 'hija', 'cena con', 'almuerzo con', 'cumple', 'whatsapp', 'abuel', 'herman', 'tio', 'prim', 'novi', 'esposa', 'esposo'],
  crecimiento: ['leer', 'lee', 'libro', 'pagina', 'curso', 'estudi', 'aprend', 'ingles', 'clase', 'podcast', 'practic', 'idioma', 'certific', 'tutorial', 'tarjetas', 'repas', 'python', 'excel'],
  finanzas: ['gast', 'ahorr', 'presupuest', 'deuda', 'factur', 'banco', 'invers', 'dinero', 'recibo', 'tarjeta', 'prestamo', 'cuenta', 'compra', 'impulso', 'pago'],
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
