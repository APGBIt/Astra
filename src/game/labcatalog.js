// Catálogo de análisis de laboratorio (1.17): los biomarcadores más comunes en los resultados de República Dominicana
// y de otros países, con sus nombres en español e inglés, su unidad, cómo convertir otras unidades y, cuando hay
// una guía clara que no depende del sexo ni de la edad, sus categorías (ADA, NHLBI, NIH ODS).
//
// El rango que manda es el que imprime tu laboratorio: cada laboratorio fija el suyo (MSD, MedlinePlus).
// Las guías solo se usan si el informe no trae rango, y siempre se dice de dónde salen.
//
// `al`: nombres como aparecen en los informes, en minúsculas y sin tildes (se comparan al inicio de la línea).
// `u`: unidad en la que se guardan y comparan. `conv`: unidad → factor para pasar a `u`.
// `abs`: conteos que también salen en % (neutrófilos 3.4 ×10³/µL o 55 %): el % se guarda aparte.

export const LAB_GROUPS = [
  { key: 'azucar', label: 'Azúcar en sangre', icon: 'drop' },
  { key: 'lipidos', label: 'Grasas en sangre', icon: 'heart' },
  { key: 'sangre', label: 'Hemograma', icon: 'drop' },
  { key: 'hierro', label: 'Hierro y vitaminas', icon: 'pill' },
  { key: 'rinon', label: 'Riñones', icon: 'filter' },
  { key: 'higado', label: 'Hígado', icon: 'flask' },
  { key: 'tiroides', label: 'Tiroides', icon: 'pulse' },
  { key: 'minerales', label: 'Sales y minerales', icon: 'sparkle' },
  { key: 'inflamacion', label: 'Inflamación', icon: 'flame' },
  { key: 'hormonas', label: 'Hormonas', icon: 'star' },
  { key: 'otros', label: 'Otros', icon: 'list' },
];
export const LAB_GROUP = Object.fromEntries(LAB_GROUPS.map((g) => [g.key, g]));

const CHOL = { 'mmol/L': 38.67 };
const TG = { 'mmol/L': 88.57 };

// Categorías de una guía: [hasta (sin incluir), estado, texto]. La última no tiene tope.
// Estados: ok (en lo deseable), atento (en el límite), alto, bajo.
export const LAB_MARKERS = [
  // ---------- Azúcar ----------
  {
    key: 'glucosa', name: 'Glucosa en ayunas', group: 'azucar', u: 'mg/dL', conv: { 'mmol/L': 18.016 },
    al: ['glucosa (en ayunas|basal|serica|plasmatica|en suero|en plasma)', 'glicemia (en ayunas|basal)?', 'glucemia (en ayunas|basal)?', 'glucosa(?! (post|pos|2|dos|a las))', 'fasting glucose', 'glucose'],
    guide: { src: 'ADA', cuts: [[100, 'ok', 'Normal'], [126, 'atento', 'En el rango de prediabetes (100 a 125)'], [Infinity, 'alto', 'En el rango de diabetes: se confirma con otra prueba']] },
    what: 'El azúcar en la sangre después de 8 horas sin comer.',
    moves: 'Sube con el ayuno incompleto, el estrés, algunas medicinas y la falta de actividad; la actividad regular y el sueño la ayudan.',
    links: ['mov', 'plato'],
  },
  {
    key: 'glucosa_post', name: 'Glucosa después de comer', group: 'azucar', u: 'mg/dL', conv: { 'mmol/L': 18.016 },
    al: ['glucosa (post|pos)(prandial|-prandial| prandial)', 'glucosa (a las )?(2|dos) h(oras)?', 'glucosa postcarga'],
    what: 'El azúcar en la sangre un tiempo después de comer o de tomar la carga de glucosa.',
  },
  {
    key: 'hba1c', name: 'Hemoglobina glicosilada (HbA1c)', group: 'azucar', u: '%', conv: { 'mmol/mol': (v) => Math.round((v * 0.09148 + 2.152) * 10) / 10 },
    al: ['hemoglobina glic?(o|a)?sil?ada', 'hemoglobina glucosilada', 'hemoglobina glicada', 'hb ?a1c', 'hgb ?a1c', 'a1c', 'glicohemoglobina', 'hemoglobina a1c'],
    guide: { src: 'ADA', cuts: [[5.7, 'ok', 'Normal'], [6.5, 'atento', 'En el rango de prediabetes (5.7 a 6.4)'], [Infinity, 'alto', 'En el rango de diabetes: se confirma con otra prueba']] },
    what: 'El promedio de tu azúcar en la sangre de los últimos 2 a 3 meses.',
    moves: 'Cambia despacio: refleja meses de comida, actividad, sueño y medicinas.',
    links: ['mov', 'plato'],
  },
  { key: 'insulina', name: 'Insulina en ayunas', group: 'azucar', u: 'µUI/mL', conv: { 'mUI/L': 1, 'pmol/L': 1 / 6 }, al: ['insulina( basal| en ayunas| serica)?', 'insulin'], what: 'La hormona que ayuda al azúcar a entrar en las células.' },

  // ---------- Lípidos ----------
  {
    key: 'col_total', name: 'Colesterol total', group: 'lipidos', u: 'mg/dL', conv: CHOL,
    al: ['colesterol total', 'colesterol serico', 'total cholesterol', 'colesterol(?! (hdl|ldl|vldl|no|de|c|-))'],
    guide: { src: 'NHLBI', cuts: [[200, 'ok', 'Deseable (menos de 200)'], [240, 'atento', 'Límite alto (200 a 239)'], [Infinity, 'alto', 'Alto (240 o más)']] },
    what: 'Todo el colesterol de la sangre: el «bueno» (HDL), el «malo» (LDL) y parte de los triglicéridos.',
    moves: 'Lo mueven la comida (grasas saturadas, fibra), la actividad, el peso y la herencia.',
    links: ['plato', 'mov'],
  },
  {
    key: 'ldl', name: 'Colesterol LDL («malo»)', group: 'lipidos', u: 'mg/dL', conv: CHOL,
    al: ['colesterol (c-?)?ldl', '(c-?)?ldl( colesterol)?(?! ?/)', 'lipoproteina(s)? de baja densidad', 'ldl-?c'],
    guide: { src: 'NHLBI', cuts: [[100, 'ok', 'Ideal (menos de 100)'], [130, 'ok', 'Casi ideal (100 a 129)'], [160, 'atento', 'Límite alto (130 a 159)'], [190, 'alto', 'Alto (160 a 189)'], [Infinity, 'alto', 'Muy alto (190 o más)']] },
    what: 'El colesterol que se puede acumular en las arterias.',
    moves: 'Baja con menos grasa saturada y trans, más fibra soluble (avena, habichuelas), actividad y, si tu médico lo indica, medicinas.',
    links: ['plato', 'mov'],
  },
  {
    key: 'hdl', name: 'Colesterol HDL («bueno»)', group: 'lipidos', u: 'mg/dL', conv: CHOL,
    al: ['colesterol (c-?)?hdl', '(c-?)?hdl( colesterol)?', 'lipoproteina(s)? de alta densidad', 'hdl-?c'],
    guide: { src: 'MedlinePlus', cuts: [[40, 'bajo', 'Bajo (menos de 40)'], [60, 'ok', 'Aceptable: lo deseable es 40 o más (en mujeres, 50 o más)'], [Infinity, 'ok', 'Protector (60 o más)']] },
    what: 'El colesterol que ayuda a sacar el exceso de las arterias.',
    moves: 'Sube con la actividad física regular y al dejar de fumar.',
    links: ['mov'],
  },
  {
    key: 'trigliceridos', name: 'Triglicéridos', group: 'lipidos', u: 'mg/dL', conv: TG,
    al: ['trigliceridos', 'triglicerido', 'triglycerides', 'tg(?![a-z])'],
    guide: { src: 'NHLBI', cuts: [[150, 'ok', 'Normal (menos de 150)'], [200, 'atento', 'Límite alto (150 a 199)'], [500, 'alto', 'Alto (200 a 499)'], [Infinity, 'alto', 'Muy alto (500 o más)']] },
    what: 'La grasa de la sangre que viene de lo que comes y bebes.',
    moves: 'Suben con el azúcar, las harinas refinadas y el alcohol; bajan con actividad y menos azúcar.',
    links: ['plato', 'mov'],
  },
  { key: 'vldl', name: 'Colesterol VLDL', group: 'lipidos', u: 'mg/dL', conv: CHOL, al: ['colesterol (c-?)?vldl', '(c-?)?vldl'], what: 'Partículas que llevan triglicéridos por la sangre.' },
  { key: 'no_hdl', name: 'Colesterol no HDL', group: 'lipidos', u: 'mg/dL', conv: CHOL, al: ['colesterol no[ -]?hdl', 'no[ -]?hdl'], what: 'Todo el colesterol menos el HDL.' },
  { key: 'apob', name: 'Apolipoproteína B', group: 'lipidos', u: 'mg/dL', conv: { 'g/L': 100 }, al: ['apolipoproteina b', 'apo ?b(?![a-z])', 'apob'], what: 'Cuenta las partículas que pueden tapar las arterias.' },
  { key: 'lpa', name: 'Lipoproteína (a)', group: 'lipidos', u: 'mg/dL', al: ['lipoproteina \\(?a\\)?', 'lp ?\\(a\\)'], what: 'Una partícula de colesterol que depende sobre todo de la herencia.' },

  // ---------- Hemograma ----------
  {
    key: 'hemoglobina', name: 'Hemoglobina', group: 'sangre', u: 'g/dL', conv: { 'g/L': 0.1 },
    al: ['hemoglobina(?! (gl|a1|corp|media|fetal))', 'hgb(?! ?a1)', 'hb(?! ?a1)(?![a-z])', 'hemoglobin'],
    what: 'La proteína de los glóbulos rojos que lleva el oxígeno. Baja en la anemia.',
    moves: 'La mueven el hierro, la B12, el ácido fólico, las pérdidas de sangre (como la regla abundante) y otras causas que ve tu médico.',
  },
  { key: 'hematocrito', name: 'Hematocrito', group: 'sangre', u: '%', al: ['hematocrito', 'hto(?![a-z])', 'hct(?![a-z])', 'hematocrit'], what: 'La parte de la sangre que ocupan los glóbulos rojos.' },
  { key: 'eritrocitos', name: 'Glóbulos rojos', group: 'sangre', u: 'x10⁶/µL', conv: { '/mm³': 1e-6 }, al: ['globulos rojos', 'eritrocitos', 'hematies', 'recuento de globulos rojos', 'rbc(?![a-z])', 'red blood cells'], what: 'Las células que llevan el oxígeno.' },
  {
    key: 'leucocitos', name: 'Glóbulos blancos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 },
    al: ['globulos blancos', 'leucocitos', 'recuento de leucocitos', 'wbc(?![a-z])', 'white blood cells'],
    what: 'Las defensas de la sangre. Suben con infecciones y otras causas.',
  },
  { key: 'plaquetas', name: 'Plaquetas', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, al: ['plaquetas', 'recuento de plaquetas', 'plt(?![a-z])', 'platelets'], what: 'Las células que ayudan a cerrar una herida.' },
  { key: 'vcm', name: 'Volumen corpuscular medio (VCM)', group: 'sangre', u: 'fL', al: ['vcm(?![a-z])', 'mcv(?![a-z])', 'volumen corpuscular medio', 'v\\.c\\.m'], what: 'El tamaño de tus glóbulos rojos. Ayuda a ver de qué tipo es una anemia.' },
  { key: 'hcm', name: 'Hemoglobina corpuscular media (HCM)', group: 'sangre', u: 'pg', al: ['hcm(?![a-z])', 'mch(?![a-z])', 'hemoglobina corpuscular media(?! conc)', 'h\\.c\\.m(?!\\.c)'], what: 'Cuánta hemoglobina lleva cada glóbulo rojo.' },
  { key: 'chcm', name: 'Concentración de hemoglobina corpuscular (CHCM)', group: 'sangre', u: 'g/dL', al: ['chcm(?![a-z])', 'mchc(?![a-z])', 'concentracion (media )?de hemoglobina corpuscular', 'c\\.h\\.c\\.m'], what: 'Qué tan concentrada está la hemoglobina en los glóbulos rojos.' },
  { key: 'rdw', name: 'Ancho de distribución eritrocitaria (RDW)', group: 'sangre', u: '%', al: ['rdw(-cv|-sd)?(?![a-z])', 'ade(?![a-z])', 'amplitud de distribucion', 'ancho de distribucion'], what: 'Qué tan parecidos son tus glóbulos rojos entre sí.' },
  { key: 'vpm', name: 'Volumen plaquetario medio', group: 'sangre', u: 'fL', al: ['vpm(?![a-z])', 'mpv(?![a-z])', 'volumen plaquetario medio'], what: 'El tamaño promedio de tus plaquetas.' },
  { key: 'neutrofilos', name: 'Neutrófilos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, abs: true, al: ['neutrofilos( segmentados| totales)?', 'segmentados', 'neutrophils'], what: 'Las defensas que más suben con las infecciones por bacterias.' },
  { key: 'linfocitos', name: 'Linfocitos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, abs: true, al: ['linfocitos', 'lymphocytes'], what: 'Defensas que actúan, por ejemplo, contra los virus.' },
  { key: 'monocitos', name: 'Monocitos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, abs: true, al: ['monocitos', 'monocytes'], what: 'Defensas que limpian lo que queda de una infección.' },
  { key: 'eosinofilos', name: 'Eosinófilos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, abs: true, al: ['eosinofilos', 'eosinophils'], what: 'Defensas que suben con alergias y parásitos.' },
  { key: 'basofilos', name: 'Basófilos', group: 'sangre', u: 'x10³/µL', conv: { '/mm³': 0.001 }, abs: true, al: ['basofilos', 'basophils'], what: 'Defensas que participan en las alergias.' },

  // ---------- Hierro y vitaminas ----------
  {
    key: 'ferritina', name: 'Ferritina', group: 'hierro', u: 'ng/mL', conv: { 'µg/L': 1 },
    al: ['ferritina( serica)?', 'ferritin'],
    what: 'El hierro que tienes guardado. Es lo primero que baja cuando falta hierro.',
    moves: 'Baja con la regla abundante, poca carne o legumbres, y algunas condiciones; sube con suplementos de hierro y también con la inflamación.',
    links: ['supl'],
  },
  { key: 'hierro', name: 'Hierro sérico', group: 'hierro', u: 'µg/dL', conv: { 'µmol/L': 5.585 }, al: ['hierro( serico| total)?', 'fe (serico|serico total)', 'iron(?! binding)'], what: 'El hierro que circula en la sangre en ese momento: cambia durante el día.', links: ['supl'] },
  { key: 'transferrina', name: 'Transferrina', group: 'hierro', u: 'mg/dL', conv: { 'g/L': 100 }, al: ['transferrina(?! sat)', 'transferrin(?! sat)'], what: 'La proteína que lleva el hierro por la sangre.' },
  { key: 'sat_transferrina', name: 'Saturación de transferrina', group: 'hierro', u: '%', al: ['(% )?sat(uracion)? (de )?(la )?transferrina', 'indice de saturacion', 'transferrin saturation'], what: 'Qué parte de la transferrina lleva hierro.' },
  { key: 'tibc', name: 'Capacidad total de fijación de hierro', group: 'hierro', u: 'µg/dL', conv: { 'µmol/L': 5.585 }, al: ['capacidad total de fijacion', 'cthf', 'tibc', 'total iron binding'], what: 'Cuánto hierro podría llevar tu sangre.' },
  {
    key: 'vitd', name: 'Vitamina D (25-OH)', group: 'hierro', u: 'ng/mL', conv: { 'nmol/L': 0.4 },
    al: ['vitamina d( 25)?', '25[ -]?(oh|hidroxi)( ?vitamina d| ?vit\\.? d| ?d)?', 'vit\\.? d(?![a-z])', 'calcidiol', '25-hydroxy', 'vitamin d'],
    guide: { src: 'NIH ODS', cuts: [[12, 'bajo', 'Riesgo de deficiencia (menos de 12)'], [20, 'atento', 'Puede quedarse corta (12 a 19)'], [50, 'ok', 'Adecuada para la mayoría (20 a 50)'], [Infinity, 'alto', 'Alta (más de 50): puede tener efectos adversos']] },
    what: 'La vitamina D que tienes en la sangre. Sirve para los huesos y los músculos.',
    moves: 'Sube con el sol y los suplementos; tarda unos 3 meses en reflejar un cambio.',
    links: ['supl'],
  },
  { key: 'b12', name: 'Vitamina B12', group: 'hierro', u: 'pg/mL', conv: { 'pmol/L': 1.355 }, al: ['vitamina b ?12', 'vit\\.? b ?12', 'cobalamina', 'cianocobalamina', 'b ?12(?![0-9])', 'vitamin b12'], what: 'Vitamina para los nervios y la sangre. Puede bajar con la metformina o una dieta sin productos animales.', links: ['supl'] },
  { key: 'folato', name: 'Ácido fólico', group: 'hierro', u: 'ng/mL', conv: { 'nmol/L': 0.441 }, al: ['acido folico( serico)?', 'folato( serico)?', 'folate', 'folic acid'], what: 'Vitamina B para formar células nuevas.', links: ['supl'] },

  // ---------- Riñones ----------
  { key: 'creatinina', name: 'Creatinina', group: 'rinon', u: 'mg/dL', conv: { 'µmol/L': 1 / 88.4 }, al: ['creatinina( serica| en suero| enzimatica)?(?! (en orina|urinaria|orina))', 'creatinine'], what: 'Un desecho de los músculos que filtran los riñones.', moves: 'Depende de cuánto músculo tienes; sube si los riñones filtran menos o con deshidratación.' },
  { key: 'tfg', name: 'Filtración de los riñones (TFG)', group: 'rinon', u: 'mL/min/1.73 m²', al: ['tasa (de )?filtracion( g\\.?| glomerular)?( estimada)?( ?\\(?e?gfr\\)?)?', 'filtrado glomerular( estimado)?', 'e?gfr(?![a-z])', 'tfg(e)?(?![a-z])', 'tfge'], what: 'Cuánta sangre filtran tus riñones por minuto, estimado con la creatinina.' },
  { key: 'bun', name: 'Nitrógeno ureico (BUN)', group: 'rinon', u: 'mg/dL', al: ['nitrogeno ureico( en sangre)?', 'bun(?![a-z])', 'n\\.? ureico'], what: 'Otro desecho que filtran los riñones.' },
  { key: 'urea', name: 'Urea', group: 'rinon', u: 'mg/dL', conv: { 'mmol/L': 6.006 }, al: ['urea( serica| en suero)?(?! (en orina|urinaria))'], what: 'Un desecho de las proteínas que filtran los riñones.' },
  { key: 'acido_urico', name: 'Ácido úrico', group: 'rinon', u: 'mg/dL', conv: { 'µmol/L': 1 / 59.48 }, al: ['acido urico( serico| en suero)?', 'uric acid'], what: 'Un desecho que, alto, puede causar gota.', moves: 'Sube con el alcohol (sobre todo la cerveza), las bebidas azucaradas y algunas carnes y mariscos.' },
  { key: 'microalbumina', name: 'Albúmina en orina', group: 'rinon', u: 'mg/g', al: ['microalbumin(a|uria)', 'relacion albumina[ /]creatinina', 'albumina en orina'], what: 'Un poco de proteína en la orina puede ser una señal temprana de daño en los riñones.' },

  // ---------- Hígado ----------
  { key: 'ast', name: 'AST (TGO)', group: 'higado', u: 'U/L', conv: { 'UI/L': 1 }, al: ['aspartato aminotransferasa( \\(?tgo\\)?)?', 'transaminasa (glutamico )?oxalacetica', 'tgo(?![a-z])', 'ast(?![a-z])', 'asat(?![a-z])', 'got(?![a-z])'], what: 'Una enzima del hígado (y de los músculos).' },
  { key: 'alt', name: 'ALT (TGP)', group: 'higado', u: 'U/L', conv: { 'UI/L': 1 }, al: ['alanin(o|a)? aminotransferasa( \\(?tgp\\)?)?', 'transaminasa (glutamico )?piruvica', 'tgp(?![a-z])', 'alt(?![a-z])', 'alat(?![a-z])', 'gpt(?![a-z])'], what: 'La enzima que más sube cuando el hígado se inflama.', moves: 'Sube con el hígado graso, el alcohol, algunas medicinas y otras causas.' },
  { key: 'ggt', name: 'Gamma glutamil transferasa (GGT)', group: 'higado', u: 'U/L', conv: { 'UI/L': 1 }, al: ['gamma ?glutamil ?(transferasa|transpeptidasa)', 'ggt(p)?(?![a-z])', 'gamma gt'], what: 'Una enzima del hígado que también sube con el alcohol.' },
  { key: 'fosfatasa', name: 'Fosfatasa alcalina', group: 'higado', u: 'U/L', conv: { 'UI/L': 1 }, al: ['fosfatasa alcalina', 'alp(?![a-z])', 'fal(?![a-z])', 'alkaline phosphatase'], what: 'Una enzima del hígado y de los huesos.' },
  { key: 'bili_total', name: 'Bilirrubina total', group: 'higado', u: 'mg/dL', conv: { 'µmol/L': 1 / 17.1 }, al: ['bilirrubina total', 'total bilirubin'], what: 'Un pigmento que procesa el hígado.' },
  { key: 'bili_directa', name: 'Bilirrubina directa', group: 'higado', u: 'mg/dL', conv: { 'µmol/L': 1 / 17.1 }, al: ['bilirrubina directa', 'bilirrubina conjugada', 'direct bilirubin'], what: 'La parte de la bilirrubina que ya procesó el hígado.' },
  { key: 'bili_indirecta', name: 'Bilirrubina indirecta', group: 'higado', u: 'mg/dL', conv: { 'µmol/L': 1 / 17.1 }, al: ['bilirrubina indirecta', 'bilirrubina no conjugada', 'indirect bilirubin'], what: 'La parte de la bilirrubina que el hígado todavía no procesa.' },
  { key: 'albumina', name: 'Albúmina', group: 'higado', u: 'g/dL', conv: { 'g/L': 0.1 }, al: ['albumina( serica| en suero)?(?! en orina)', 'albumin'], what: 'La proteína principal de la sangre; la fabrica el hígado.' },
  { key: 'proteinas', name: 'Proteínas totales', group: 'higado', u: 'g/dL', conv: { 'g/L': 0.1 }, al: ['proteinas totales( sericas)?', 'total protein'], what: 'Todas las proteínas de la sangre.' },

  // ---------- Tiroides ----------
  // «mUI/mL» en una TSH casi siempre es una µ mal leída (nadie la informa en miles): se toma igual.
  { key: 'tsh', name: 'TSH', group: 'tiroides', u: 'µUI/mL', conv: { 'mUI/L': 1, 'mUI/mL': 1 }, al: ['tsh( ultrasensible| us| 3a gen| tercera generacion)?', 'tirotropina', 'hormona estimulante de (la )?tiroides', 'thyroid stimulating'], what: 'La señal que manda el cerebro a la tiroides. Sube cuando la tiroides trabaja poco.', moves: 'La biotina (vitamina B7) puede alterar algunas pruebas: pregúntale a tu laboratorio si debes dejarla antes.' },
  { key: 't4l', name: 'T4 libre', group: 'tiroides', u: 'ng/dL', conv: { 'pmol/L': 1 / 12.87 }, al: ['t4 libre', 'tiroxina libre', 'ft4', 'free t4'], what: 'La hormona de la tiroides que está disponible para el cuerpo.' },
  { key: 't3l', name: 'T3 libre', group: 'tiroides', u: 'pg/mL', conv: { 'pmol/L': 0.651 }, al: ['t3 libre', 'triyodotironina libre', 'ft3', 'free t3'], what: 'La forma más activa de la hormona de la tiroides.' },
  { key: 't4', name: 'T4 total', group: 'tiroides', u: 'µg/dL', al: ['t4 total', 'tiroxina total', 't4(?![a-z0-9])'], what: 'Toda la T4 de la sangre.' },
  { key: 't3', name: 'T3 total', group: 'tiroides', u: 'ng/dL', al: ['t3 total', 'triyodotironina total', 't3(?![a-z0-9])'], what: 'Toda la T3 de la sangre.' },

  // ---------- Sales y minerales ----------
  { key: 'sodio', name: 'Sodio', group: 'minerales', u: 'mEq/L', conv: { 'mmol/L': 1 }, al: ['sodio( serico)?', 'na\\+?(?![a-z])', 'sodium'], what: 'La sal principal de la sangre; ayuda con el agua del cuerpo.' },
  { key: 'potasio', name: 'Potasio', group: 'minerales', u: 'mEq/L', conv: { 'mmol/L': 1 }, al: ['potasio( serico)?', 'k\\+?(?![a-z])', 'potassium'], what: 'Un mineral clave para el corazón y los músculos. Algunas medicinas de la presión lo suben.' },
  { key: 'cloro', name: 'Cloro', group: 'minerales', u: 'mEq/L', conv: { 'mmol/L': 1 }, al: ['cloro( serico)?', 'cloruro(s)?', 'cl-?(?![a-z])', 'chloride'], what: 'Acompaña al sodio en la sangre.' },
  { key: 'calcio', name: 'Calcio', group: 'minerales', u: 'mg/dL', conv: { 'mmol/L': 4.008 }, al: ['calcio( total| serico| en suero)?(?! ionico)', 'calcium'], what: 'El calcio de la sangre: el cuerpo lo mantiene muy estable.' },
  { key: 'magnesio', name: 'Magnesio', group: 'minerales', u: 'mg/dL', conv: { 'mmol/L': 2.431, 'mEq/L': 1.215 }, al: ['magnesio( serico| en suero)?', 'magnesium'], what: 'Mineral para los músculos y los nervios.' },
  { key: 'fosforo', name: 'Fósforo', group: 'minerales', u: 'mg/dL', conv: { 'mmol/L': 3.097 }, al: ['fosforo( serico| en suero| inorganico)?', 'phosphorus'], what: 'Mineral que trabaja con el calcio en los huesos.' },

  // ---------- Inflamación ----------
  { key: 'pcr_us', name: 'Proteína C reactiva ultrasensible', group: 'inflamacion', u: 'mg/L', conv: { 'mg/dL': 10 }, al: ['proteina c reactiva (ultrasensible|alta sensibilidad|us|hs)', 'pcr[- ]?(us|hs|ultrasensible)', 'hs-?crp', 'hs-?pcr'], what: 'Una medida fina de inflamación que se usa para el riesgo del corazón.' },
  { key: 'pcr', name: 'Proteína C reactiva', group: 'inflamacion', u: 'mg/L', conv: { 'mg/dL': 10 }, al: ['proteina c reactiva', 'pcr(?![a-z])', 'crp(?![a-z])', 'c-reactive protein'], what: 'Sube cuando hay inflamación o una infección.' },
  { key: 'vsg', name: 'Velocidad de sedimentación (VSG)', group: 'inflamacion', u: 'mm/h', al: ['velocidad de (sedimentacion|eritrosedimentacion)( globular)?', 'eritrosedimentacion', 'vsg(?![a-z])', 'esr(?![a-z])'], what: 'Otra medida general de inflamación.' },

  // ---------- Hormonas ----------
  { key: 'testosterona', name: 'Testosterona total', group: 'hormonas', u: 'ng/dL', conv: { 'nmol/L': 28.84, 'ng/mL': 100 }, al: ['testosterona( total)?', 'testosterone'], what: 'Hormona presente en hombres y mujeres, en cantidades distintas.' },
  { key: 'estradiol', name: 'Estradiol', group: 'hormonas', u: 'pg/mL', conv: { 'pmol/L': 1 / 3.671 }, al: ['estradiol', 'e2(?![a-z0-9])'], what: 'El estrógeno principal; cambia mucho durante el ciclo.' },
  { key: 'progesterona', name: 'Progesterona', group: 'hormonas', u: 'ng/mL', conv: { 'nmol/L': 1 / 3.18 }, al: ['progesterona', 'progesterone'], what: 'Hormona que cambia con el ciclo y el embarazo.' },
  { key: 'prolactina', name: 'Prolactina', group: 'hormonas', u: 'ng/mL', al: ['prolactina', 'prolactin'], what: 'Hormona de la leche materna; también sube con el estrés y algunas medicinas.' },
  { key: 'fsh', name: 'FSH', group: 'hormonas', u: 'mUI/mL', al: ['fsh(?![a-z])', 'hormona foliculo estimulante', 'foliculoestimulante'], what: 'Hormona que regula los ovarios y los testículos.' },
  { key: 'lh', name: 'LH', group: 'hormonas', u: 'mUI/mL', al: ['lh(?![a-z])', 'hormona luteinizante', 'luteinizante'], what: 'Hormona que regula la ovulación y los testículos.' },
  { key: 'cortisol', name: 'Cortisol', group: 'hormonas', u: 'µg/dL', conv: { 'nmol/L': 1 / 27.59 }, al: ['cortisol( am| matutino| serico| basal)?'], what: 'La hormona del estrés; cambia según la hora del día.' },
  { key: 'psa', name: 'Antígeno prostático (PSA)', group: 'hormonas', u: 'ng/mL', al: ['psa( total)?(?![a-z])', 'antigeno prostatico( especifico)?( total)?'], what: 'Proteína de la próstata.' },
];

export const LAB_MARKER = Object.fromEntries(LAB_MARKERS.map((m) => [m.key, m]));

// En qué puede ayudarte Astra con cada tipo de resultado.
export const LAB_LINKS = {
  mov: { label: 'Plan de movimiento', href: '#/area/salud', icon: 'dumbbell' },
  plato: { label: 'Tu plato', href: '#/area/salud', icon: 'utensils' },
  supl: { label: 'Vitaminas y minerales', href: '#/nutrientes', icon: 'pill' },
};

// Suplementos que conviene revisar con un análisis a los 3 meses (1.14: pendiente de la versión anterior).
// Nutriente de `nutrients.js` → marcador.
export const SUPP_CHECK = { vitd: 'vitd', hierro: 'ferritina', b12: 'b12', folato: 'folato' };
export const SUPP_CHECK_DAYS = 90;
