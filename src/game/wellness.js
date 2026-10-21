// Contenido de bienestar (1.6): emociones con su significado, estrategias, respiraciones, meditaciones guiadas,
// programa de inicio, preguntas del diario, valores, rueda de la vida, chequeo OMS-5 y trampas de pensamiento.
// Los textos son propios de Astra; las prácticas siguen técnicas conocidas (atención plena, autocompasión,
// suspiro cíclico, 5-4-3-2-1, relajación muscular, registro de pensamientos de la terapia cognitiva).

// ---------- Emociones: 20 por cuadrante, las más comunes primero ----------
// Sustantivos (no cambian con el género): «Siento ansiedad», «Siento calma».

export const EMOTIONS = [
  // 0 · Tenso: mucha energía, desagradable
  [
    ['Estrés', 'Muchas exigencias y poco margen para cumplirlas.'],
    ['Ansiedad', 'Inquietud por algo que podría pasar.'],
    ['Preocupación', 'Tu mente vuelve una y otra vez a un problema.'],
    ['Frustración', 'Algo no sale como esperabas pese a tu esfuerzo.'],
    ['Irritación', 'Molestia que salta con muy poco.'],
    ['Agobio', 'Sientes que es demasiado para ti ahora mismo.'],
    ['Nervios', 'Energía inquieta antes de algo importante.'],
    ['Enojo', 'Algo te parece injusto o te bloquea el camino.'],
    ['Tensión', 'Tu cuerpo está en guardia, apretado.'],
    ['Impaciencia', 'Quieres que algo pase ya.'],
    ['Miedo', 'Sientes que algo te amenaza o te puede hacer daño.'],
    ['Molestia', 'Algo te incomoda y no te deja estar bien.'],
    ['Inquietud', 'No logras quedarte en calma.'],
    ['Presión', 'Sientes que te exigen más de lo que puedes dar.'],
    ['Culpa', 'Sientes que hiciste algo que va contra lo que valoras.'],
    ['Vergüenza', 'Sientes que otros vieron algo que no querías mostrar.'],
    ['Celos', 'Temes perder algo o a alguien que valoras.'],
    ['Incomodidad', 'Algo no encaja y te molesta un poco.'],
    ['Pánico', 'Miedo repentino que se siente en todo el cuerpo.'],
    ['Furia', 'Enojo tan fuerte que cuesta pensar con calma.'],
  ],
  // 1 · Animado: mucha energía, agradable
  [
    ['Alegría', 'Ganas de sonreír y de celebrar.'],
    ['Motivación', 'Impulso para avanzar hacia lo que quieres.'],
    ['Entusiasmo', 'Muchas ganas de hacer algo.'],
    ['Ganas', 'Energía disponible para hacer cosas.'],
    ['Optimismo', 'Esperas que las cosas salgan bien.'],
    ['Orgullo', 'Satisfacción por algo que lograste tú o alguien cercano.'],
    ['Emoción', 'Ilusión intensa por algo que está pasando o que viene.'],
    ['Inspiración', 'Se te ocurren ideas y quieres crear.'],
    ['Confianza', 'Sientes que puedes con lo que viene.'],
    ['Diversión', 'Disfrutas y te ríes con facilidad.'],
    ['Curiosidad', 'Quieres saber, probar o explorar algo.'],
    ['Ilusión', 'Esperas con ganas algo bonito.'],
    ['Determinación', 'Decidiste hacerlo y vas por ello.'],
    ['Enfoque', 'Tu atención está justo donde quieres.'],
    ['Conexión', 'Te sientes cerca de alguien.'],
    ['Sorpresa', 'Pasó algo inesperado y bueno.'],
    ['Admiración', 'Alguien o algo te parece digno de respeto.'],
    ['Valentía', 'Te atreves aunque sientas algo de miedo.'],
    ['Ánimo', 'Buen humor y disposición para el día.'],
    ['Euforia', 'Alegría desbordante, difícil de contener.'],
  ],
  // 2 · Bajo: poca energía, desagradable
  [
    ['Cansancio', 'Tu cuerpo o tu mente piden descanso.'],
    ['Tristeza', 'Algo duele o se perdió.'],
    ['Desánimo', 'Se te fueron las ganas.'],
    ['Agotamiento', 'Sin energía física ni mental.'],
    ['Aburrimiento', 'Nada te llama la atención.'],
    ['Soledad', 'Te falta compañía o alguien con quien conectar.'],
    ['Decepción', 'Algo o alguien no fue como esperabas.'],
    ['Apatía', 'Sin chispa: nada te mueve ahora.'],
    ['Inseguridad', 'Dudas de ti o de lo que vales.'],
    ['Nostalgia', 'Extrañas algo o a alguien del pasado.'],
    ['Desmotivación', 'No encuentras impulso para empezar.'],
    ['Melancolía', 'Tristeza suave y pensativa.'],
    ['Vacío', 'Sientes un hueco, como si faltara algo.'],
    ['Dolor', 'Alguien o algo te hirió.'],
    ['Arrepentimiento', 'Quisieras haber actuado distinto.'],
    ['Exclusión', 'Sientes que te dejaron afuera.'],
    ['Desconexión', 'Te sientes lejos de ti o de los demás.'],
    ['Indiferencia', 'Nada te importa mucho en este momento.'],
    ['Pena', 'Te duele lo que le pasa a alguien o lo que te pasa a ti.'],
    ['Desesperanza', 'Sientes que nada va a mejorar.'],
  ],
  // 3 · Tranquilo: poca energía, agradable
  [
    ['Calma', 'Tu mente está quieta.'],
    ['Gratitud', 'Valoras lo que tienes o lo que recibiste.'],
    ['Paz', 'Nada te inquieta por dentro.'],
    ['Satisfacción', 'Sientes que lo que hiciste fue suficiente.'],
    ['Relajación', 'El cuerpo suelto, sin prisa.'],
    ['Serenidad', 'Calma firme aunque haya cosas pendientes.'],
    ['Bienestar', 'Te sientes bien, sin necesitar más.'],
    ['Esperanza', 'Confías en que algo bueno viene.'],
    ['Alivio', 'Se te quitó un peso de encima.'],
    ['Comodidad', 'Estás a gusto donde estás.'],
    ['Cariño', 'Sientes que te quieren y quieres a alguien.'],
    ['Ternura', 'Sientes ganas de cuidar a alguien.'],
    ['Seguridad', 'Sientes que estás a salvo.'],
    ['Equilibrio', 'Lo que haces y lo que necesitas están en armonía.'],
    ['Presencia', 'Tu atención está en lo que pasa ahora.'],
    ['Plenitud', 'Sientes que tu vida tiene sentido ahora mismo.'],
    ['Compasión', 'Sientes el dolor del otro y quieres ayudar.'],
    ['Descanso', 'Recuperaste energía.'],
    ['Reflexión', 'Tienes ganas de pensar con calma.'],
    ['Sueño', 'Tu cuerpo está listo para dormir.'],
  ],
];

// Palabras de antes (adjetivos) y variantes: se cuentan como su emoción.
export const LEGACY_EMOTIONS = {
  estresado: 'Estrés', ansioso: 'Ansiedad', frustrado: 'Frustración', irritado: 'Irritación', preocupado: 'Preocupación',
  abrumado: 'Agobio', molesto: 'Molestia', nervioso: 'Nervios', enojado: 'Enojo', tenso: 'Tensión', impaciente: 'Impaciencia',
  asustado: 'Miedo', culpable: 'Culpa', avergonzado: 'Vergüenza', celoso: 'Celos', furioso: 'Furia',
  motivado: 'Motivación', entusiasmado: 'Entusiasmo', alegre: 'Alegría', feliz: 'Alegría', orgulloso: 'Orgullo', inspirado: 'Inspiración',
  'con ganas': 'Ganas', emocionado: 'Emoción', optimista: 'Optimismo', confiado: 'Confianza', curioso: 'Curiosidad', sorprendido: 'Sorpresa',
  cansado: 'Cansancio', triste: 'Tristeza', desanimado: 'Desánimo', aburrido: 'Aburrimiento', solo: 'Soledad', agotado: 'Agotamiento',
  decepcionado: 'Decepción', apagado: 'Apatía', inseguro: 'Inseguridad', nostalgico: 'Nostalgia', desmotivado: 'Desmotivación', herido: 'Dolor',
  'en calma': 'Calma', tranquilo: 'Calma', agradecido: 'Gratitud', satisfecho: 'Satisfacción', relajado: 'Relajación', comodo: 'Comodidad',
  esperanzado: 'Esperanza', 'en paz': 'Paz', sereno: 'Serenidad', aliviado: 'Alivio', descansado: 'Descanso', pleno: 'Plenitud',
};

// Dónde se siente en el cuerpo (opcional).
export const BODY_SPOTS = ['Cabeza', 'Mandíbula', 'Garganta', 'Hombros', 'Pecho', 'Estómago', 'Espalda', 'Manos', 'Piernas', 'Todo el cuerpo'];

// ---------- Estrategias según cómo te sientes ----------
// action: { breath: id, min } · { guided: id } · { sos: true } · { tool: 'descarga' | 'replantear' } · { route } · { potion }

export const STRATEGIES = [
  [
    { id: 'suspiro', icon: 'sparkle', title: 'Suspiro cíclico · 1 min', desc: 'Dos inhalaciones y una exhalación larga: baja la activación rápido.', action: { breath: 'suspiro', min: 1 } },
    { id: 'sos', icon: 'shield', title: 'Pausa SOS · 3 min', desc: 'Respiración y tus cinco sentidos para volver al presente.', action: { sos: true } },
    { id: 'descarga', icon: 'note', title: 'Descarga mental', desc: 'Saca lo que te preocupa y separa lo que depende de ti.', action: { tool: 'descarga' } },
    { id: 'replantear', icon: 'edit', title: 'Replantea el pensamiento', desc: 'Mira si tu mente cae en una trampa y busca otra forma de verlo.', action: { tool: 'replantear' } },
    { id: 'mover', icon: 'pulse', title: 'Muévete 5 minutos', desc: 'Camina o estírate: el cuerpo ayuda a soltar la tensión.', action: null },
  ],
  [
    { id: 'anotar', icon: 'star', title: 'Anótalo para recordarlo', desc: 'Escribir lo bueno hace que dure más.', action: { route: '/diario?k=gratitud' } },
    { id: 'compartir', icon: 'chat', title: 'Compártelo con alguien', desc: 'Contar lo bueno multiplica la alegría.', action: { route: '/personas' } },
    { id: 'enfoque', icon: 'timer', title: 'Úsalo en algo difícil', desc: 'Aprovecha la energía en una sesión de enfoque.', action: { route: '/enfoque' } },
  ],
  [
    { id: 'aire', icon: 'sun', title: '10 minutos afuera', desc: 'La luz y el aire suben el ánimo y la energía.', action: { potion: 'aire' } },
    { id: 'contacto', icon: 'people', title: 'Escríbele a alguien', desc: 'Una conversación corta con alguien de confianza.', action: { route: '/personas' } },
    { id: 'autocompasion', icon: 'heart', title: 'Pausa de autocompasión · 5 min', desc: 'Háblate como le hablarías a alguien que quieres.', action: { guided: 'autocompasion' } },
    { id: 'paso', icon: 'check', title: 'Un paso pequeñito', desc: 'Elige la tarea más pequeña de tu lista y hazla.', action: { route: '/pendientes' } },
    { id: 'coherente', icon: 'sparkle', title: 'Respiración 5·5 · 3 min', desc: 'Un ritmo parejo que estabiliza el cuerpo.', action: { breath: 'coherente', min: 3 } },
  ],
  [
    { id: 'meditar', icon: 'sparkle', title: 'Medita 5 minutos', desc: 'Buen momento para practicar la calma.', action: { guided: 'respiracion' } },
    { id: 'gratitud', icon: 'heart', title: 'Tres cosas buenas', desc: 'Lo que agradeces hoy y por qué.', action: { route: '/diario?k=gratitud' } },
    { id: 'diario', icon: 'book', title: 'Escribe en tu diario', desc: 'La calma ayuda a ver las cosas con claridad.', action: { route: '/diario' } },
  ],
];

// ---------- Respiraciones ----------
// Fases: in (inhala), in2 (un poco más), hold (sostén lleno), out (exhala), hold2 (sostén vacío). Segundos.

export const BREATHS = [
  {
    id: 'suspiro', title: 'Suspiro cíclico', icon: 'sparkle', minutes: [1, 3, 5], min: 5,
    desc: 'Dos inhalaciones por la nariz y una exhalación larga por la boca. En un estudio de Stanford con adultos sanos, cinco minutos al día mejoraron el ánimo más que la meditación.',
    phases: [['in', 2, 'Inhala por la nariz'], ['in2', 1, 'Un poco más'], ['out', 6, 'Exhala lento por la boca']],
  },
  {
    id: 'calma', title: 'Calma 4·6', icon: 'moon', minutes: [1, 3, 5], min: 3,
    desc: 'Exhalar más largo que inhalar le dice a tu cuerpo que puede bajar el ritmo.',
    phases: [['in', 4, 'Inhala'], ['out', 6, 'Exhala']],
  },
  {
    id: 'caja', title: 'Caja 4·4·4·4', icon: 'target', minutes: [1, 3, 5], min: 3,
    desc: 'Inhala, sostén, exhala y sostén, cuatro tiempos cada uno. Útil para enfocarte bajo presión.',
    phases: [['in', 4, 'Inhala'], ['hold', 4, 'Sostén'], ['out', 4, 'Exhala'], ['hold2', 4, 'Sostén']],
  },
  {
    id: 'coherente', title: 'Coherente 5·5', icon: 'pulse', minutes: [3, 5, 10], min: 5,
    desc: 'Unas seis respiraciones por minuto, parejas y suaves, para estabilizar el cuerpo.',
    phases: [['in', 5, 'Inhala'], ['out', 5, 'Exhala']],
  },
  {
    id: '478', title: '4·7·8 para dormir', icon: 'bed', cycles: 4,
    desc: 'Inhala 4, sostén 7 y exhala 8. Son cuatro ciclos; si te mareas, vuelve a respirar normal.',
    phases: [['in', 4, 'Inhala por la nariz'], ['hold', 7, 'Sostén'], ['out', 8, 'Exhala por la boca']],
  },
];
export const BREATH = Object.fromEntries(BREATHS.map((b) => [b.id, b]));
export const breathCycle = (b) => b.phases.reduce((a, p) => a + p[1], 0);

// ---------- Meditaciones guiadas ----------
// Cada paso empieza en `at` segundos; el último dura hasta el final (`minutes`).

export const GUIDED = [
  {
    id: 'respiracion', title: 'Respiración consciente', minutes: 5, icon: 'sparkle', desc: 'La práctica base: volver a la respiración cada vez que la mente se va.',
    steps: [
      [0, 'Busca una postura cómoda. Deja la espalda recta, sin tensión.'],
      [15, 'Si quieres, cierra los ojos. Si no, deja la mirada suave, hacia el suelo.'],
      [30, 'Respira como respiras siempre. No tienes que cambiar nada.'],
      [45, 'Nota dónde sientes más la respiración: la nariz, el pecho o la barriga. Quédate ahí.'],
      [75, 'Siente el aire que entra… y el aire que sale.'],
      [110, 'Si tu mente se va a otra cosa, es normal. Date cuenta y vuelve con calma a la respiración.'],
      [150, 'Cada vez que vuelves, entrenas tu atención. Eso es meditar.'],
      [190, 'Sigue acompañando cada respiración, una a la vez.'],
      [240, 'Ahora abre tu atención a todo el cuerpo, aquí, respirando.'],
      [270, 'Haz una respiración un poco más profunda. Cuando quieras, abre los ojos.'],
    ],
  },
  {
    id: 'pausa3', title: 'Pausa de tres pasos', minutes: 3, icon: 'clock', desc: 'Tres minutos para salir del piloto automático en medio del día.',
    steps: [
      [0, 'Son tres pasos de un minuto. Endereza la espalda y apoya los pies en el suelo.'],
      [10, 'Paso uno: date cuenta. ¿Qué pensamientos hay ahora? ¿Qué emociones? ¿Qué sientes en el cuerpo? Solo obsérvalo.'],
      [70, 'Paso dos: junta tu atención en la respiración. Siente cómo entra y sale el aire en la barriga.'],
      [130, 'Paso tres: abre la atención a todo el cuerpo, como si respiraras con todo él. Nota la postura, la cara, los hombros.'],
      [165, 'Lleva esta atención amplia a lo que sigue en tu día.'],
    ],
  },
  {
    id: 'sentidos', title: 'Anclarte con los sentidos', minutes: 4, icon: 'eye', desc: 'El 5-4-3-2-1: cinco cosas que ves, cuatro que tocas, tres que oyes, dos que hueles y una que saboreas.',
    steps: [
      [0, 'Este ejercicio te trae al presente con tus sentidos. Puedes hacerlo con los ojos abiertos.'],
      [12, 'Haz una respiración lenta y deja salir el aire despacio.'],
      [25, 'Mira a tu alrededor y nombra en silencio cinco cosas que ves. Fíjate en sus colores y formas.'],
      [70, 'Ahora cuatro cosas que puedes tocar o sentir: la ropa, la silla, el suelo bajo tus pies, el aire en la piel.'],
      [115, 'Tres cosas que oyes, cercanas o lejanas.'],
      [155, 'Dos olores. Si no notas ninguno, recuerda dos que te gusten.'],
      [190, 'Un sabor: el que tienes en la boca, o un sorbo de agua.'],
      [215, 'Respira otra vez despacio. Estás aquí, en este momento.'],
    ],
  },
  {
    id: 'pensamientos', title: 'Observa tus pensamientos', minutes: 6, icon: 'cloud', desc: 'Mirar los pensamientos pasar, como nubes, sin pelear con ellos.',
    steps: [
      [0, 'Acomódate y cierra los ojos, o deja la mirada baja.'],
      [15, 'Empieza con unas respiraciones tranquilas, sintiendo el aire.'],
      [45, 'Ahora, en lugar de seguir la respiración, observa tu mente. ¿Qué pensamientos aparecen?'],
      [90, 'Imagina que cada pensamiento es una nube que cruza el cielo. No la empujas ni la atrapas: la miras pasar.'],
      [150, 'Si un pensamiento te arrastra, está bien. Cuando lo notes, ponle nombre —«planear», «recordar», «preocuparme»— y vuelve a mirar.'],
      [220, 'Tú no eres tus pensamientos. Eres quien los observa.'],
      [270, 'Deja que la mente se acomode sola, sin forzarla.'],
      [320, 'Vuelve a la respiración por unos momentos.'],
      [345, 'Abre los ojos cuando quieras.'],
    ],
  },
  {
    id: 'cuerpo', title: 'Escaneo corporal', minutes: 10, icon: 'pulse', desc: 'Recorre el cuerpo de los pies a la cabeza y suelta la tensión que encuentres.',
    steps: [
      [0, 'Acuéstate o recuéstate de forma cómoda. Deja los brazos a los lados y cierra los ojos si quieres.'],
      [20, 'Haz tres respiraciones lentas. Con cada exhalación, deja que el cuerpo pese un poco más.'],
      [50, 'Lleva la atención a los pies. Nota lo que sientes: calor, frío, hormigueo, o nada. Todo está bien.'],
      [100, 'Sube a las piernas: pantorrillas, rodillas, muslos. Si hay tensión, solo date cuenta.'],
      [160, 'Ahora la cadera y la parte baja de la espalda. Deja que se apoyen.'],
      [210, 'Siente la barriga subir y bajar con la respiración.'],
      [260, 'Lleva la atención al pecho y a la espalda alta. Nota el latido o el movimiento del aire.'],
      [320, 'Las manos, los brazos y los hombros. Si están apretados, invítalos a aflojar al exhalar.'],
      [380, 'El cuello y la garganta. Luego la mandíbula: deja que se separe un poco.'],
      [430, 'La cara: los ojos, la frente, el cuero cabelludo. Suelta lo que puedas soltar.'],
      [490, 'Ahora siente el cuerpo completo, de los pies a la cabeza, respirando.'],
      [550, 'Mueve despacio los dedos de las manos y de los pies. Estírate si lo necesitas.'],
      [580, 'Cuando quieras, abre los ojos y vuelve a tu día.'],
    ],
  },
  {
    id: 'bondad', title: 'Bondad', minutes: 7, icon: 'heart', desc: 'Desearte bien y desearle bien a otras personas, poco a poco.',
    steps: [
      [0, 'Acomódate y respira con suavidad. Pon una mano en el pecho si te ayuda.'],
      [20, 'Trae a tu mente a alguien que te quiere o te quiso bien. Siente ese cariño.'],
      [60, 'Ahora repite en silencio, para ti: «Que esté bien. Que esté en paz. Que me trate con cariño.»'],
      [120, 'Si te cuesta desearte bien, no pasa nada. Repite las frases y deja que hagan su trabajo.'],
      [170, 'Piensa en una persona que quieres y deséale lo mismo: «Que estés bien. Que estés en paz. Que seas feliz.»'],
      [240, 'Ahora en alguien neutral, alguien que ves a veces y no conoces mucho. Deséale lo mismo.'],
      [300, 'Si quieres, piensa en alguien con quien tienes una dificultad. Deséale lo que puedas: «Que estés en paz.»'],
      [360, 'Por último, abre el deseo a todos: «Que todas las personas estén bien.»'],
      [400, 'Quédate unos segundos con esta sensación. Abre los ojos cuando quieras.'],
    ],
  },
  {
    id: 'autocompasion', title: 'Pausa de autocompasión', minutes: 5, icon: 'heart', desc: 'Para un momento difícil: reconocerlo, recordar que es humano y tratarte con amabilidad.',
    steps: [
      [0, 'Piensa en algo que te está costando ahora. Algo de dificultad media, no lo más difícil.'],
      [25, 'Nota dónde lo sientes en el cuerpo. Respira hacia ese lugar.'],
      [60, 'Primero, reconócelo: «Esto es difícil. Este es un momento de sufrimiento.»'],
      [110, 'Segundo, recuerda que no es solo cosa tuya: «Pasar por momentos difíciles es parte de ser humano. Otras personas también lo viven.»'],
      [170, 'Tercero, pon una mano en el pecho y siente su calor. Dite: «Que pueda tratarme con amabilidad.»'],
      [220, 'Busca las palabras que necesitas oír: «Que pueda perdonarme», «Que tenga paciencia conmigo», «Que acepte lo que siento.»'],
      [265, 'Pregúntate qué le dirías a alguien que quieres si estuviera en tu lugar. Dítelo a ti.'],
      [290, 'Respira una vez más. Abre los ojos cuando quieras.'],
    ],
  },
  {
    id: 'gratitud', title: 'Gratitud', minutes: 5, icon: 'gift', desc: 'Recordar con detalle lo bueno de tu día, de tu gente y de tu cuerpo.',
    steps: [
      [0, 'Acomódate y haz unas respiraciones tranquilas.'],
      [20, 'Trae a tu mente algo de hoy, aunque sea pequeño, que te hizo bien.'],
      [60, 'Recuerda los detalles: dónde estabas, quién estaba, qué sentiste.'],
      [110, 'Ahora piensa en una persona que hace tu vida mejor. ¿Qué es lo que valoras de ella?'],
      [170, 'Piensa en algo de tu cuerpo o de tu salud que te sostiene cada día.'],
      [220, 'Nota cómo se siente la gratitud en el cuerpo. Quédate con esa sensación.'],
      [270, 'Si quieres, después anota tres cosas buenas en tu diario. Abre los ojos cuando quieras.'],
    ],
  },
  {
    id: 'dormir', title: 'Relajación para dormir', minutes: 10, icon: 'bed', desc: 'Tensa y suelta cada parte del cuerpo para llegar al sueño más suelto.',
    steps: [
      [0, 'Acuéstate en tu cama y apaga lo que puedas. Vas a tensar y soltar cada parte del cuerpo.'],
      [20, 'Respira hondo por la nariz y suelta el aire lento por la boca. Otra vez.'],
      [45, 'Aprieta los pies, encogiendo los dedos, cinco segundos… y suelta. Siente la diferencia.'],
      [85, 'Tensa las piernas, apretando los muslos… y suelta.'],
      [125, 'Aprieta los glúteos y la barriga… y suelta.'],
      [165, 'Cierra los puños con fuerza… y suelta. Deja las manos pesadas.'],
      [205, 'Sube los hombros hacia las orejas… y déjalos caer.'],
      [245, 'Arruga la cara: ojos, frente, nariz… y suelta. Afloja la mandíbula.'],
      [290, 'Ahora todo el cuerpo está más suelto. Respira despacio, con la exhalación más larga.'],
      [350, 'Imagina un lugar donde te sientes a salvo. Mira sus colores, escucha sus sonidos.'],
      [430, 'Con cada exhalación te hundes un poco más en la cama.'],
      [500, 'No tienes que hacer nada más. Puedes quedarte así y dejar que llegue el sueño.'],
    ],
  },
  {
    id: 'caminar', title: 'Caminar con atención', minutes: 6, icon: 'pulse', desc: 'Una meditación en movimiento, adentro o afuera.',
    steps: [
      [0, 'Busca un espacio donde puedas dar unos pasos, adentro o afuera. Camina más despacio de lo normal.'],
      [20, 'Siente el peso del cuerpo en los pies. Nota cómo se levanta un pie… avanza… y se apoya.'],
      [80, 'Siente el contacto con el suelo en cada paso: el talón, la planta, los dedos.'],
      [140, 'Si la mente se va, vuelve a sentir tus pies.'],
      [190, 'Ahora amplía la atención: los sonidos, el aire, lo que ves a tu paso.'],
      [250, 'Camina a tu ritmo, notando el cuerpo entero en movimiento.'],
      [310, 'Para despacio. Quédate de pie un momento y siente cómo está tu cuerpo.'],
      [340, 'Sigue con tu día con esta misma atención.'],
    ],
  },
];
export const GUIDE = Object.fromEntries(GUIDED.map((g) => [g.id, g]));

// Pausa SOS (unos 3 minutos): suspiro cíclico, los cinco sentidos y un cierre amable.
export const SOS = {
  id: 'sos', title: 'Pausa SOS', minutes: 3,
  segments: [
    { text: 'Estás aquí y estás a salvo en este momento. Vamos a bajar el ritmo.', dur: 9 },
    { breath: 'suspiro', dur: 54, text: 'Respira conmigo.' },
    { text: 'Mira a tu alrededor y nombra cinco cosas que ves.', dur: 20 },
    { text: 'Cuatro cosas que puedes tocar.', dur: 18 },
    { text: 'Tres sonidos.', dur: 16 },
    { text: 'Dos olores, o dos que te gusten.', dur: 14 },
    { text: 'Un sabor.', dur: 10 },
    { text: 'Pon una mano en el pecho. Inhala… y exhala largo.', dur: 20 },
    { text: 'Lo que sientes es intenso y va a pasar. Ya diste un paso para cuidarte.', dur: 19 },
  ],
};

// Programa de inicio: un día a la vez.
export const PROGRAM = {
  id: 'inicio7', title: 'Siete días para empezar', desc: 'Una práctica corta cada día para aprender lo básico de la meditación.',
  days: [
    { title: 'Volver a la respiración', guided: 'respiracion' },
    { title: 'Una pausa para cualquier momento', guided: 'pausa3' },
    { title: 'El presente está en tus sentidos', guided: 'sentidos' },
    { title: 'Mirar los pensamientos', guided: 'pensamientos' },
    { title: 'Escuchar el cuerpo', guided: 'cuerpo' },
    { title: 'Desearte bien', guided: 'bondad' },
    { title: 'Diez minutos en silencio', timer: { minutes: 10, every: 5 } },
  ],
};

// Sonidos de fondo (se generan en el teléfono: funcionan sin internet).
export const SOUNDS = [
  { id: 'silencio', label: 'Silencio' },
  { id: 'lluvia', label: 'Lluvia' },
  { id: 'olas', label: 'Olas' },
  { id: 'marron', label: 'Ruido suave' },
];

// ---------- Herramientas para la mente ----------

// Trampas de pensamiento (distorsiones cognitivas) para «Replantear un pensamiento».
export const THINKING_TRAPS = [
  { id: 'catastrofe', label: 'Catastrofizar', desc: 'Imaginar lo peor como si fuera a pasar seguro.' },
  { id: 'todo-nada', label: 'Todo o nada', desc: 'Si no es perfecto, es un fracaso.' },
  { id: 'mente', label: 'Leer la mente', desc: 'Dar por hecho lo que otros piensan de ti.' },
  { id: 'futuro', label: 'Adivinar el futuro', desc: 'Predecir que va a salir mal sin pruebas.' },
  { id: 'generalizar', label: 'Generalizar', desc: '«Siempre», «nunca», «todo el mundo».' },
  { id: 'etiqueta', label: 'Ponerte etiquetas', desc: '«Soy un desastre» en vez de «me equivoqué en esto».' },
  { id: 'deberia', label: 'Los «debería»', desc: 'Reglas rígidas sobre cómo tienen que ser las cosas.' },
  { id: 'personalizar', label: 'Personalizar', desc: 'Sentir que todo es por ti o es tu culpa.' },
  { id: 'filtro', label: 'Filtro negativo', desc: 'Ver solo lo malo y no contar lo bueno.' },
  { id: 'emocional', label: 'Razonar con la emoción', desc: '«Lo siento así, entonces es verdad.»' },
];

export const REFRAME_HELP = [
  '¿Qué le dirías a una persona que quieres si pensara esto?',
  '¿Qué es lo más probable que pase, no lo peor?',
  '¿Esto importará dentro de un año?',
  '¿Qué parte depende de ti y cuál no?',
];

// ---------- Diario ----------

export const JOURNAL_KINDS = [
  { id: 'libre', label: 'Libre', icon: 'edit' },
  { id: 'pregunta', label: 'Pregunta del día', icon: 'sparkle' },
  { id: 'gratitud', label: 'Tres cosas buenas', icon: 'heart' },
  { id: 'aprendizaje', label: 'Lo que aprendí', icon: 'book' },
];

export const JOURNAL_PROMPTS = [
  '¿Qué fue lo mejor de hoy y por qué?',
  '¿Qué te dio energía hoy y qué te la quitó?',
  '¿Qué te dio orgullo hoy, aunque sea pequeño?',
  '¿Qué emoción se repitió hoy? ¿Qué la provocó?',
  '¿Qué harías distinto si repitieras el día?',
  '¿A quién te gustaría agradecerle algo esta semana?',
  '¿Qué aprendiste hoy de ti?',
  '¿Qué te está preocupando? ¿Qué parte depende de ti?',
  '¿Qué necesitas soltar?',
  '¿Qué te haría la semana más ligera?',
  '¿Cuándo te sentiste más tú hoy?',
  '¿Qué conversación tienes pendiente?',
  'Escribe tres cosas que valoras de tu vida ahora mismo.',
  '¿Qué hábito te está ayudando? ¿Cuál te está frenando?',
  '¿Qué le dirías a tu yo de hace cinco años?',
  '¿Qué te gustaría que dijera tu yo del próximo año sobre este momento?',
  '¿Qué límite necesitas poner?',
  '¿Qué te hizo reír esta semana?',
  '¿Qué decisión estás posponiendo? ¿Qué te frena?',
  '¿Qué cosa sencilla te hace bien y no haces seguido?',
  '¿Qué miedo te visitó hoy? ¿Qué te dijo?',
  '¿A quién ayudaste hoy? ¿Quién te ayudó?',
  '¿Qué significa para ti tener un buen día?',
  '¿En qué estás mejorando, aunque sea despacio?',
  '¿Qué te gustaría recordar de este mes?',
  '¿Cómo cuidaste tu cuerpo hoy?',
  '¿Qué te dio paz esta semana?',
  '¿Qué es lo próximo pequeño que puedes hacer por tu meta?',
  '¿Qué crítica te hiciste hoy? ¿Cómo la dirías con más cariño?',
  '¿Qué agradeces de tu trabajo o de tus estudios?',
  '¿Qué te inspiró últimamente?',
  '¿Qué te gustaría aprender este año y por qué?',
  '¿Qué relación quieres cuidar más?',
  '¿Qué te gustaría dejar de exigirte?',
  'Describe un momento de hoy con todos los detalles que recuerdes.',
  '¿Qué te dijo tu cuerpo hoy que no escuchaste?',
  '¿Qué valor tuyo se notó hoy en lo que hiciste?',
  '¿Qué hiciste hoy solo por disfrutar?',
  '¿Qué te preocupaba hace un mes y ya pasó?',
  '¿Qué palabra resume tu semana? ¿Por qué esa?',
];

// ---------- Valores ----------

export const VALUES = [
  ['familia', 'Familia', 'Cuidar y estar con los tuyos.'],
  ['salud', 'Salud', 'Cuidar tu cuerpo y tu mente.'],
  ['honestidad', 'Honestidad', 'Decir y vivir la verdad.'],
  ['aprendizaje', 'Aprendizaje', 'Crecer y entender más.'],
  ['libertad', 'Libertad', 'Elegir tu propio camino.'],
  ['servicio', 'Servicio', 'Ayudar y aportar a otros.'],
  ['fe', 'Fe', 'Vivir tu espiritualidad.'],
  ['creatividad', 'Creatividad', 'Crear cosas nuevas.'],
  ['estabilidad', 'Estabilidad', 'Tener bases firmes y seguras.'],
  ['aventura', 'Aventura', 'Explorar y vivir experiencias.'],
  ['justicia', 'Justicia', 'Tratar a todos con equidad.'],
  ['amistad', 'Amistad', 'Cultivar lazos de confianza.'],
  ['excelencia', 'Excelencia', 'Hacer las cosas muy bien.'],
  ['generosidad', 'Generosidad', 'Compartir lo que tienes.'],
  ['paz', 'Paz', 'Vivir con calma y armonía.'],
  ['disciplina', 'Disciplina', 'Cumplir lo que te propones.'],
  ['respeto', 'Respeto', 'Valorar a cada persona.'],
  ['responsabilidad', 'Responsabilidad', 'Responder por lo que haces.'],
  ['humor', 'Humor', 'Reír y no tomarte todo tan en serio.'],
  ['amor', 'Amor', 'Dar y recibir cariño.'],
  ['independencia', 'Independencia', 'Valerte por ti.'],
  ['logro', 'Logro', 'Alcanzar metas que importan.'],
  ['gratitud', 'Gratitud', 'Valorar lo que tienes.'],
  ['valentia', 'Valentía', 'Actuar aunque dé miedo.'],
  ['compasion', 'Compasión', 'Acompañar el dolor de otros.'],
  ['comunidad', 'Comunidad', 'Ser parte de algo más grande.'],
  ['naturaleza', 'Naturaleza', 'Conectar con el mundo natural.'],
  ['equilibrio', 'Equilibrio', 'Dar espacio a cada parte de tu vida.'],
  ['lealtad', 'Lealtad', 'Estar para quienes cuentan contigo.'],
  ['proposito', 'Propósito', 'Que lo que haces tenga sentido.'],
].map(([id, label, desc]) => ({ id, label, desc }));
export const VALUE = Object.fromEntries(VALUES.map((v) => [v.id, v]));

// ---------- Rueda de la vida ----------

export const WHEEL = [
  { id: 'salud', label: 'Salud', color: 'salud' },
  { id: 'mente', label: 'Mente y emociones', color: 'emocional' },
  { id: 'relaciones', label: 'Relaciones', color: 'relaciones' },
  { id: 'crecimiento', label: 'Crecimiento', color: 'crecimiento' },
  { id: 'dinero', label: 'Dinero', color: 'finanzas' },
  { id: 'trabajo', label: 'Trabajo o estudios', color: 'laborales' },
  { id: 'hogar', label: 'Hogar', color: 'hogar' },
  { id: 'disfrute', label: 'Disfrute y descanso', color: 'xp' },
];
// Para crear una meta desde el área más baja.
export const WHEEL_AREA = { salud: 'salud', mente: 'emocional', relaciones: 'relaciones', crecimiento: 'crecimiento', dinero: 'finanzas', trabajo: 'laborales', hogar: null, disfrute: null };

// ---------- Chequeo de bienestar OMS-5 (WHO-5) ----------
// Últimas dos semanas. Puntaje bruto 0–25 × 4 = 0–100. Menos de 52 (13 bruto) sugiere bajo bienestar.

export const WHO5_ITEMS = [
  'Me he sentido alegre y de buen humor',
  'Me he sentido tranquilo/a y relajado/a',
  'Me he sentido activo/a y enérgico/a',
  'Me he despertado fresco/a y descansado/a',
  'Mi vida cotidiana ha estado llena de cosas que me interesan',
];
export const WHO5_OPTIONS = [
  [5, 'Todo el tiempo'],
  [4, 'La mayor parte del tiempo'],
  [3, 'Más de la mitad del tiempo'],
  [2, 'Menos de la mitad del tiempo'],
  [1, 'De vez en cuando'],
  [0, 'Nunca'],
];
export const WHO5_LOW = 52;

// ---------- Ayuda ----------
// República Dominicana. Línea 811 del Ministerio de Salud Pública (salud mental) y 911 para emergencias.

export const HELP = {
  emergency: '911',
  line: '811',
  lineName: 'Línea de salud mental 811',
  lineDesc: 'Línea nacional y gratuita, atendida por psicólogos: orientación, apoyo emocional y, si hace falta, referimiento a un servicio de salud.',
  abroad: 'Si vives en otro país, busca la línea de ayuda de tu país o el número de emergencias local.',
};

// ---------- Tus cartas para días difíciles (1.10) ----------
// Como las «coping cards» de MindShift (Anxiety Canada): frases y acciones que te escribes en un día tranquilo
// para leerlas cuando estés tenso o bajo. `quads`: 0 = tenso, 2 = bajo.
export const COPING_IDEAS = [
  { kind: 'frase', text: 'Esto es incómodo, pero puedo manejarlo.', quads: [0, 2] },
  { kind: 'frase', text: 'Lo que siento es real, pero no siempre dice la verdad.', quads: [0, 2] },
  { kind: 'frase', text: 'Un paso a la vez: solo el siguiente.', quads: [0, 2] },
  { kind: 'frase', text: 'No tengo que resolverlo todo hoy.', quads: [0] },
  { kind: 'frase', text: 'Ya he salido de días así antes.', quads: [2] },
  { kind: 'frase', text: 'Me hablo como le hablaría a alguien que quiero.', quads: [0, 2] },
  { kind: 'accion', text: 'Respirar un minuto: inhalo en 4, exhalo en 6.', quads: [0] },
  { kind: 'accion', text: 'Salir a caminar 10 minutos.', quads: [0, 2] },
  { kind: 'accion', text: 'Escribirle a alguien de confianza.', quads: [2] },
  { kind: 'accion', text: 'Tomar agua y comer algo.', quads: [2] },
  { kind: 'accion', text: 'Poner la canción que me sube el ánimo.', quads: [2] },
  { kind: 'accion', text: 'Sacar de la cabeza lo que me preocupa: escribirlo y ver qué depende de mí.', quads: [0] },
];
