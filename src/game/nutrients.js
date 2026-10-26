// Salud 1.14: guía de vitaminas, minerales y suplementos comunes, con cuándo tomarlos, con qué, qué separar
// y por cuánto tiempo. Cantidades para adultos según las tablas de ingesta de referencia (Oficina de Suplementos
// Dietéticos de los NIH); la sal y la actividad, según la OMS. Es información general: no reemplaza a tu médico.
import { timeToMin, minToTime } from './logic.js';

// Momentos del día. La hora sale de tus comidas (Mis horarios) y de tu hora de dormir.
export const SLOTS = [
  { key: 'ayunas', label: 'En ayunas', hint: '30 min antes del desayuno' },
  { key: 'desayuno', label: 'Con el desayuno', hint: '' },
  { key: 'almuerzo', label: 'Con el almuerzo', hint: 'La comida con más grasa del día' },
  { key: 'cena', label: 'Con la cena', hint: '' },
  { key: 'noche', label: 'En la noche', hint: '30 min antes de dormir' },
];
export const SLOT = Object.fromEntries(SLOTS.map((x) => [x.key, x]));
export const DEFAULT_MEALS = { desayuno: '07:30', almuerzo: '12:30', cena: '19:00', dormir: '22:30' };

// rda: { h, m } (hombres, mujeres de 19 a 50 años), con la unidad; `older`: lo que cambia después de los 50.
// ul: límite superior diario para adultos (lo que no conviene pasar sin indicación médica); `ulFrom`: a qué se aplica.
// gap: con qué separarlo y cuántas horas. period: por cuánto tiempo.
export const NUTRIENTS = [
  {
    key: 'vitd', name: 'Vitamina D', kind: 'vitamina', icon: 'sun',
    aliases: ['vitamina d', 'vit d', 'vitamina d3', 'd3', 'colecalciferol', 'cholecalciferol', 'ergocalciferol'],
    what: 'Ayuda a absorber el calcio y mantener los huesos; también participa en los músculos y las defensas.',
    rda: { h: 15, m: 15, unit: 'mcg', alt: '600 UI' }, older: '20 mcg (800 UI) desde los 71 años.',
    ul: 100, ulUnit: 'mcg', ulText: '100 mcg (4,000 UI) al día, sumando todo.',
    foods: 'Sardinas, salmón, atún, yema de huevo, leche fortificada y el sol en la piel (no a través del cristal).',
    slot: 'almuerzo', with: 'Con una comida que tenga algo de grasa (aguacate, huevo, aceite). Lo que más pesa es tomarla todos los días.',
    period: 'Diaria y continua. Si te recetan dosis altas semanales (por ejemplo 50,000 UI), es por un tiempo y con análisis de control.',
    who: 'Quien recibe poco sol, piel oscura, mayores de 70, obesidad o problemas para absorber grasa.',
    meds: 'Orlistat la absorbe menos; en dosis altas puede restarle efecto a algunas estatinas; con diuréticos tiazídicos puede subir el calcio de la sangre.',
    gap: [],
  },
  {
    key: 'b12', name: 'Vitamina B12', kind: 'vitamina', icon: 'bolt',
    aliases: ['b12', 'vitamina b12', 'cobalamina', 'cianocobalamina', 'metilcobalamina'],
    what: 'Forma glóbulos rojos y cuida los nervios. Sin ella aparece cansancio y anemia.',
    rda: { h: 2.4, m: 2.4, unit: 'mcg' }, older: 'Después de los 50 conviene obtenerla de alimentos fortificados o suplemento: se absorbe peor de la comida.',
    ul: null, ulText: 'No tiene límite fijado: no se ha visto daño ni en dosis altas (500 o 1,000 mcg).',
    foods: 'Pescado, carne, pollo, huevos, leche, queso y yogur. Las plantas no la tienen si no son fortificadas.',
    slot: 'desayuno', with: 'Con o sin comida. En la mañana es fácil de recordar.',
    period: 'Diaria y continua si eres vegetariana o vegana, tomas metformina o antiácidos por mucho tiempo.',
    who: 'Mayores de 50, vegetarianos y veganos, quien toma metformina u omeprazol (y parecidos).',
    meds: 'La metformina y los antiácidos (omeprazol, lansoprazol, esomeprazol, pantoprazol) pueden bajarla con el tiempo.',
    gap: [],
  },
  {
    key: 'folato', name: 'Ácido fólico (B9)', kind: 'vitamina', icon: 'sprout',
    aliases: ['acido folico', 'ácido fólico', 'folico', 'fólico', 'folato', 'b9', 'metilfolato'],
    what: 'Ayuda a formar células nuevas. Antes y al inicio del embarazo previene defectos del tubo neural del bebé.',
    rda: { h: 400, m: 400, unit: 'mcg', alt: 'DFE' }, older: 'Embarazo: 600 mcg.',
    ul: 1000, ulUnit: 'mcg', ulText: '1,000 mcg al día de ácido fólico de suplementos y alimentos fortificados.',
    foods: 'Habichuelas, lentejas, gandules, vegetales de hoja verde, aguacate, naranja y pan o harinas fortificadas.',
    slot: 'desayuno', with: 'Con o sin comida.',
    period: 'Diario mientras exista la posibilidad de embarazo (empezar antes de quedar embarazada) o mientras lo indique tu médico.',
    who: 'Mujeres que pueden quedar embarazadas; quien come pocas legumbres y vegetales verdes.',
    meds: 'En exceso puede tapar una falta de B12: si tomas mucho ácido fólico, revisa también la B12.',
    gap: [],
  },
  {
    key: 'bcomplex', name: 'Complejo B', kind: 'vitamina', icon: 'bolt',
    aliases: ['complejo b', 'complejo-b', 'b complex', 'vitamina b', 'tiamina', 'b1', 'riboflavina', 'b2', 'niacina', 'b3', 'piridoxina', 'b6', 'biotina', 'b7', 'pantotenico', 'b5'],
    what: 'Ayudan a sacar energía de la comida y cuidan nervios y piel (tiamina, riboflavina, niacina, B6, biotina y otras).',
    rda: { h: 1.3, m: 1.3, unit: 'mg', alt: 'de B6' }, older: 'Tiamina 1.2 / 1.1 mg, riboflavina 1.3 / 1.1 mg, niacina 16 / 14 mg y biotina 30 mcg (hombres / mujeres). La B6 sube a 1.7 / 1.5 mg después de los 50.',
    ul: 100, ulUnit: 'mg', ulText: 'B6: 100 mg al día. Niacina: 35 mg de suplementos (más da enrojecimiento y calor en la piel).',
    foods: 'Pollo, pescado, huevos, habichuelas, maní, avena, guineo, víveres y cereales fortificados.',
    slot: 'desayuno', with: 'Con el desayuno. Es normal que la orina salga amarillo fuerte (es la riboflavina).',
    period: 'Diario si tu alimentación es pobre o si te lo indicaron; con buena comida no suele hacer falta.',
    who: 'Quien come poco variado, bebe alcohol con frecuencia o es mayor.',
    meds: 'La biotina en dosis altas puede alterar algunos análisis de laboratorio (tiroides, corazón): avisa antes de sacarte sangre.',
    gap: [],
  },
  {
    key: 'vitc', name: 'Vitamina C', kind: 'vitamina', icon: 'sun',
    aliases: ['vitamina c', 'vit c', 'acido ascorbico', 'ácido ascórbico', 'ascorbato'],
    what: 'Antioxidante; ayuda a cicatrizar, a formar colágeno y a absorber el hierro de las plantas.',
    rda: { h: 90, m: 75, unit: 'mg' }, older: 'Si fumas, 35 mg más al día.',
    ul: 2000, ulUnit: 'mg', ulText: '2,000 mg al día. Más puede dar diarrea y molestias de estómago.',
    foods: 'Guayaba, acerola, chinola, naranja, limón, piña, ají morrón, tomate y brócoli.',
    slot: 'desayuno', with: 'Con comida. Si tomas hierro, tómalos juntos: la vitamina C ayuda a absorberlo.',
    period: 'Diaria. Con 1 o 2 frutas cítricas al día casi siempre basta sin suplemento.',
    who: 'Quien fuma o come pocas frutas y vegetales.',
    meds: '',
    gap: [],
  },
  {
    key: 'vita', name: 'Vitamina A', kind: 'vitamina', icon: 'eye',
    aliases: ['vitamina a', 'vit a', 'retinol', 'betacaroteno', 'beta caroteno'],
    what: 'Cuida la vista, la piel y las defensas.',
    rda: { h: 900, m: 700, unit: 'mcg', alt: 'RAE' }, older: '',
    ul: 3000, ulUnit: 'mcg', ulText: '3,000 mcg al día de vitamina A ya formada (retinol). El betacaroteno de las frutas no tiene ese riesgo.',
    foods: 'Auyama, zanahoria, batata, mango, lechosa, espinaca, hígado y huevo.',
    slot: 'almuerzo', with: 'Con una comida con algo de grasa.',
    period: 'Rara vez hace falta suplemento: la comida la cubre. Solo por indicación médica.',
    who: 'Casi nadie con una alimentación variada.',
    meds: 'En exceso daña el hígado y, en el embarazo, al bebé. Si fumas, evita los suplementos de betacaroteno. Orlistat la absorbe menos.',
    gap: [],
  },
  {
    key: 'vite', name: 'Vitamina E', kind: 'vitamina', icon: 'shield',
    aliases: ['vitamina e', 'vit e', 'tocoferol'],
    what: 'Antioxidante que protege las células.',
    rda: { h: 15, m: 15, unit: 'mg' }, older: '',
    ul: 1000, ulUnit: 'mg', ulText: '1,000 mg al día de suplementos.',
    foods: 'Maní, almendras, semillas de girasol, aceites vegetales, aguacate y espinaca.',
    slot: 'almuerzo', with: 'Con una comida con algo de grasa.',
    period: 'Rara vez hace falta suplemento. Solo por indicación médica.',
    who: 'Casi nadie con una alimentación variada.',
    meds: 'En dosis altas aumenta el riesgo de sangrado con anticoagulantes (warfarina) y antes de una cirugía. Orlistat la absorbe menos.',
    gap: [],
  },
  {
    key: 'vitk', name: 'Vitamina K', kind: 'vitamina', icon: 'sprout',
    aliases: ['vitamina k', 'vit k', 'k2', 'menaquinona', 'fitomenadiona'],
    what: 'Ayuda a que la sangre coagule y a los huesos.',
    rda: { h: 120, m: 90, unit: 'mcg' }, older: '',
    ul: null, ulText: 'No tiene límite fijado.',
    foods: 'Vegetales de hoja verde (espinaca, lechuga, berro), brócoli y repollo.',
    slot: 'almuerzo', with: 'Con una comida con algo de grasa.',
    period: 'La comida la cubre. Suplemento solo por indicación médica.',
    who: 'Casi nadie con una alimentación variada.',
    meds: 'Con warfarina: no empieces ni dejes la vitamina K sin hablar con tu médico, y come cantidades parecidas de vegetales verdes cada día.',
    gap: [],
  },
  {
    key: 'calcio', name: 'Calcio', kind: 'mineral', icon: 'shield',
    aliases: ['calcio', 'carbonato de calcio', 'citrato de calcio', 'calcium', 'caltrate', 'calcibon'],
    what: 'Forma huesos y dientes; también lo usan los músculos, los nervios y el corazón.',
    rda: { h: 1000, m: 1000, unit: 'mg' }, older: 'Mujeres de 51 a 70 años: 1,200 mg. Todos desde los 71: 1,200 mg.',
    ul: 2500, ulUnit: 'mg', ulText: '2,500 mg al día hasta los 50 años y 2,000 mg desde los 51, sumando comida y suplementos.',
    foods: 'Leche, yogur, queso, sardinas con espinas, tofu con calcio, brócoli y bebidas fortificadas.',
    slot: 'cena', with: 'Máximo 500 mg por toma: si tomas más, divídelo en dos. El carbonato se absorbe mejor con comida; el citrato, con o sin comida.',
    period: 'Diario y continuo si no llegas con la comida (por ejemplo, si casi no comes lácteos).',
    who: 'Quien come pocos lácteos, mujeres después de la menopausia, mayores.',
    meds: 'Sepáralo 4 horas de la levotiroxina y 2 horas de antibióticos como ciprofloxacino o doxiciclina.',
    gap: [['hierro', 2]], splitAt: 500,
  },
  {
    key: 'hierro', name: 'Hierro', kind: 'mineral', icon: 'drop',
    aliases: ['hierro', 'sulfato ferroso', 'fumarato ferroso', 'gluconato ferroso', 'ferroso', 'ferrico', 'férrico', 'iron', 'bisglicinato de hierro'],
    what: 'Lleva el oxígeno en la sangre. La falta da anemia: cansancio, palidez, uñas frágiles.',
    rda: { h: 8, m: 18, unit: 'mg' }, older: 'Mujeres desde los 51: 8 mg. Embarazo: 27 mg. Vegetarianos: casi el doble.',
    ul: 45, ulUnit: 'mg', ulText: '45 mg al día. El médico puede indicar más por un tiempo para tratar una anemia.',
    foods: 'Carne de res, hígado, pollo, pescado, habichuelas, lentejas, gandules, espinaca y cereales fortificados.',
    slot: 'ayunas', with: 'Con el estómago vacío y con vitamina C (jugo de naranja o chinola). Si te cae mal, tómalo con algo de comida. Lejos de lácteos, café y té (1 a 2 horas).',
    period: 'Por un tiempo: el médico suele revisar la hemoglobina y la ferritina a los 2 o 3 meses. No lo tomes por tu cuenta sin saber que te falta.',
    who: 'Mujeres con menstruación abundante, embarazadas, donantes de sangre frecuentes y vegetarianos.',
    meds: 'Le resta efecto a la levotiroxina y a la levodopa (sepáralo). El omeprazol y parecidos absorben menos hierro.',
    gap: [['calcio', 2], ['zinc', 2]],
  },
  {
    key: 'magnesio', name: 'Magnesio', kind: 'mineral', icon: 'moon',
    aliases: ['magnesio', 'citrato de magnesio', 'glicinato de magnesio', 'oxido de magnesio', 'óxido de magnesio', 'cloruro de magnesio', 'magnesium'],
    what: 'Participa en músculos, nervios, azúcar en sangre y presión. Ayuda con calambres.',
    rda: { h: 420, m: 320, unit: 'mg' }, older: 'De 19 a 30 años: 400 mg los hombres y 310 mg las mujeres.',
    ul: 350, ulUnit: 'mg', ulText: '350 mg al día de suplementos (el de la comida no cuenta). Más da diarrea y cólicos.',
    foods: 'Semillas de auyama, maní, almendras, habichuelas, espinaca, avena, aguacate, guineo y cacao.',
    slot: 'noche', with: 'Con la cena o antes de dormir. El óxido y el citrato aflojan el estómago más que el glicinato.',
    period: 'Diario mientras lo necesites; revisa con tu médico si tienes problemas de riñón.',
    who: 'Quien come pocas semillas, legumbres y vegetales; diabetes; uso largo de antiácidos o diuréticos.',
    meds: 'Sepáralo de antibióticos y de los medicamentos para la osteoporosis (alendronato). El uso largo de antiácidos puede bajarlo.',
    gap: [],
  },
  {
    key: 'zinc', name: 'Zinc', kind: 'mineral', icon: 'shield',
    aliases: ['zinc', 'gluconato de zinc', 'sulfato de zinc', 'picolinato de zinc'],
    what: 'Defensas, cicatrización, gusto y olfato.',
    rda: { h: 11, m: 8, unit: 'mg' }, older: '',
    ul: 40, ulUnit: 'mg', ulText: '40 mg al día sumando todo. Mucho tiempo en dosis altas baja el cobre.',
    foods: 'Carne, mariscos, pollo, habichuelas, maní, semillas, huevos y lácteos.',
    slot: 'almuerzo', with: 'Con comida (en ayunas puede dar náuseas). Lejos del hierro.',
    period: 'Por un tiempo o según indicación; no hace falta de forma continua con buena comida.',
    who: 'Vegetarianos, problemas digestivos, quien bebe mucho alcohol.',
    meds: 'Con antibióticos (ciprofloxacino, doxiciclina): el antibiótico 2 horas antes o de 4 a 6 horas después del zinc.',
    gap: [['hierro', 2]],
  },
  {
    key: 'potasio', name: 'Potasio', kind: 'mineral', icon: 'heart',
    aliases: ['potasio', 'cloruro de potasio', 'potassium'],
    what: 'Ayuda al corazón, los músculos y a controlar la presión.',
    rda: { h: 3400, m: 2600, unit: 'mg' }, older: '',
    ul: null, ulText: 'Sin límite para la comida. En pastillas, solo con receta.',
    foods: 'Guineo, plátano, aguacate, batata, habichuelas, agua de coco, tomate, espinaca y lechosa.',
    slot: 'almuerzo', with: 'Mejor de la comida.',
    period: 'Suplemento solo con indicación médica.',
    who: 'Casi todos comemos menos de lo recomendado: más frutas, vegetales y legumbres.',
    meds: 'Peligroso en pastillas si tomas enalapril, losartán, espironolactona u otros para la presión, o si tienes problemas de riñón.',
    gap: [],
  },
  {
    key: 'yodo', name: 'Yodo', kind: 'mineral', icon: 'drop',
    aliases: ['yodo', 'yoduro', 'iodine'],
    what: 'Lo usa la tiroides para regular el metabolismo.',
    rda: { h: 150, m: 150, unit: 'mcg' }, older: 'Embarazo: 220 mcg.',
    ul: 1100, ulUnit: 'mcg', ulText: '1,100 mcg al día.',
    foods: 'Sal yodada (poca), pescado, mariscos, huevos y lácteos.',
    slot: 'desayuno', with: 'Con comida.',
    period: 'La sal yodada lo cubre. Suplemento en el embarazo o si te lo indican.',
    who: 'Embarazadas y quien no usa sal yodada ni come pescado o lácteos.',
    meds: 'Si tienes enfermedad de la tiroides, consulta antes de tomarlo.',
    gap: [],
  },
  {
    key: 'selenio', name: 'Selenio', kind: 'mineral', icon: 'shield',
    aliases: ['selenio', 'selenium'],
    what: 'Antioxidante; lo usa la tiroides.',
    rda: { h: 55, m: 55, unit: 'mcg' }, older: '',
    ul: 400, ulUnit: 'mcg', ulText: '400 mcg al día. Una o dos nueces de Brasil ya dan mucho.',
    foods: 'Pescado, mariscos, huevos, pollo, carne y nueces de Brasil.',
    slot: 'almuerzo', with: 'Con comida.',
    period: 'Rara vez hace falta suplemento.',
    who: 'Casi nadie con una alimentación variada.',
    meds: '',
    gap: [],
  },
  {
    key: 'omega3', name: 'Omega-3', kind: 'otro', icon: 'drop',
    aliases: ['omega 3', 'omega-3', 'omega3', 'aceite de pescado', 'fish oil', 'epa', 'dha', 'aceite de krill'],
    what: 'Grasas buenas para el corazón y el cerebro (EPA y DHA del pescado; ALA de semillas).',
    rda: { h: 1.6, m: 1.1, unit: 'g', alt: 'de ALA' }, older: 'EPA y DHA no tienen cantidad fijada; para quien tiene enfermedad del corazón se sugiere cerca de 1 g al día.',
    ul: 5, ulUnit: 'g', ulText: 'No más de 5 g al día de EPA y DHA de suplementos (FDA).',
    foods: 'Sardinas, salmón, arenque, atún, chía, linaza y nueces. Pescado azul 2 veces por semana.',
    slot: 'almuerzo', with: 'Con comida: da menos reflujo y sabor a pescado.',
    period: 'Diario y continuo si no comes pescado; revisa con tu médico.',
    who: 'Quien casi no come pescado.',
    meds: 'En dosis altas aumenta el riesgo de sangrado con warfarina y otros anticoagulantes.',
    gap: [],
  },
  {
    key: 'multi', name: 'Multivitamínico', kind: 'otro', icon: 'pill',
    aliases: ['multivitaminico', 'multivitamínico', 'multivitamina', 'multi', 'centrum', 'supradyn', 'prenatal', 'polivitaminico', 'polivitamínico'],
    what: 'Un poco de casi todo. Sirve de seguro, no reemplaza comer bien.',
    rda: null, older: '',
    ul: null, ulText: 'Si además tomas otras vitaminas, suma lo de cada etiqueta para no pasar los límites (vitamina A, D, hierro, zinc).',
    foods: '',
    slot: 'desayuno', with: 'Con el desayuno o el almuerzo, con comida.',
    period: 'Diario y continuo. Los prenatales, desde antes del embarazo y durante la lactancia.',
    who: 'Quien come poco variado, embarazadas (prenatal) o por indicación médica.',
    meds: 'Si tiene hierro o calcio, aplica lo mismo que a esos minerales (levotiroxina, antibióticos).',
    gap: [],
  },
  {
    key: 'fibra', name: 'Fibra (psilio)', kind: 'otro', icon: 'sprout',
    aliases: ['psilio', 'psyllium', 'fibra', 'metamucil', 'plantago'],
    what: 'Ayuda al intestino, a sentirte lleno y al colesterol.',
    rda: { h: 38, m: 25, unit: 'g' }, older: 'Desde los 51: 30 g los hombres y 21 g las mujeres.',
    ul: null, ulText: 'Sin límite, pero súbela poco a poco y con agua.',
    foods: 'Habichuelas, lentejas, avena, víveres con cáscara, frutas enteras, vegetales y pan integral.',
    slot: 'desayuno', with: 'Con un vaso grande de agua. Sepárala 2 horas de medicinas y otros suplementos.',
    period: 'Diaria mientras la necesites.',
    who: 'Quien come pocas frutas, vegetales, legumbres e integrales.',
    meds: 'Puede restar absorción a medicinas: tómalas 2 horas antes o después.',
    gap: [['*', 2]],
  },
];
export const NUTRIENT = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));
export const NUTRIENT_KINDS = [['vitamina', 'Vitaminas'], ['mineral', 'Minerales'], ['otro', 'Otros']];

// Medicinas que se llevan mal con suplementos. `gap`: horas de separación con esos nutrientes.
export const DRUG_RULES = [
  { key: 'levo', names: ['levotiroxina', 'eutirox', 'euthyrox', 'synthroid', 'levothyroxine', 'tiroxina'], with: ['calcio', 'hierro', 'magnesio', 'multi'], gap: 4,
    text: 'Toma la levotiroxina sola, en ayunas, y deja 4 horas antes del calcio, el hierro, el magnesio o un multivitamínico.' },
  { key: 'abx', names: ['ciprofloxacino', 'ciprofloxacina', 'cipro', 'levofloxacino', 'moxifloxacino', 'norfloxacino', 'doxiciclina', 'minociclina', 'tetraciclina'], with: ['calcio', 'hierro', 'zinc', 'magnesio', 'multi'], gap: 2,
    text: 'Este antibiótico se absorbe menos con minerales: tómalo 2 horas antes o de 4 a 6 horas después del calcio, hierro, zinc, magnesio o multivitamínico.' },
  { key: 'bisf', names: ['alendronato', 'risedronato', 'ibandronato', 'fosamax'], with: ['calcio', 'magnesio', 'hierro', 'multi'], gap: 1,
    text: 'Tómalo solo, en ayunas, como dice su prospecto, y deja los suplementos de calcio, magnesio o hierro para más tarde.' },
  { key: 'levodopa', names: ['levodopa', 'sinemet', 'stalevo', 'carbidopa'], with: ['hierro'], gap: 2,
    text: 'El hierro le resta efecto a la levodopa: sepáralos al menos 2 horas.' },
  { key: 'warf', names: ['warfarina', 'coumadin', 'acenocumarol', 'sintrom'], with: ['vitk', 'omega3', 'vite'], gap: 0,
    text: 'Con este anticoagulante, no empieces ni dejes vitamina K, omega-3 o vitamina E en dosis altas sin hablar con tu médico.' },
  { key: 'metf', names: ['metformina', 'glucophage', 'glafornil'], with: ['b12'], gap: 0,
    text: 'La metformina puede bajar la vitamina B12 con los años: pide que te la revisen.' },
  { key: 'ibp', names: ['omeprazol', 'esomeprazol', 'lansoprazol', 'pantoprazol', 'rabeprazol', 'nexium'], with: ['b12', 'hierro', 'magnesio'], gap: 0,
    text: 'Los protectores de estómago, por mucho tiempo, pueden bajar la B12, el magnesio y el hierro.' },
  { key: 'estat', names: ['atorvastatina', 'simvastatina', 'lovastatina', 'rosuvastatina', 'pravastatina'], with: ['vitd'], gap: 0,
    text: 'La vitamina D en dosis altas podría restarle efecto a la estatina: dile a tu médico cuánta tomas.' },
  { key: 'tiaz', names: ['hidroclorotiazida', 'clortalidona', 'indapamida'], with: ['calcio', 'vitd'], gap: 0,
    text: 'Con este diurético, el calcio y la vitamina D juntos pueden subir mucho el calcio de la sangre: consulta las dosis.' },
  { key: 'k', names: ['enalapril', 'lisinopril', 'captopril', 'losartan', 'losartán', 'valsartan', 'valsartán', 'irbesartan', 'telmisartan', 'espironolactona'], with: ['potasio'], gap: 0,
    text: 'Con este medicamento para la presión, el potasio en pastillas puede subir de más: solo con receta.' },
  { key: 'orli', names: ['orlistat', 'xenical'], with: ['vitd', 'vita', 'vite', 'vitk', 'multi'], gap: 2,
    text: 'El orlistat absorbe menos las vitaminas A, D, E y K: toma el multivitamínico 2 horas antes o después (por ejemplo, al acostarte).' },
];

// ---------- Reconocer lo que tomas ----------

export const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasWord = (hay, w) => { const f = fold(w); return f.length <= 3 ? new RegExp(`(^| )${f}( |$)`).test(hay) : hay.includes(f); };

// Qué nutriente es (por el nombre). Ej. «Vitamina D3 1000» → vitd; «Sulfato ferroso» → hierro.
export function nutrientOf(name) {
  const hay = fold(name);
  if (!hay) return null;
  let best = null; let len = 0;
  for (const n of NUTRIENTS) for (const a of n.aliases) {
    const f = fold(a);
    if (f.length > len && hasWord(hay, a)) { best = n; len = f.length; }
  }
  return best;
}

// «Sulfato ferroso 300 mg» o «carbonato de calcio 1250 mg» dicen el peso de la sal, no del mineral:
// así no se puede comparar con el límite. Se compara solo si la dosis dice «elemental» o no nombra la sal.
const SALTS = ['sulfato', 'fumarato', 'gluconato', 'carbonato', 'citrato', 'oxido', 'cloruro', 'bisglicinato', 'glicinato', 'picolinato', 'lactato'];
export function saltOnly(m, n) {
  if (!['hierro', 'calcio', 'magnesio', 'zinc'].includes(n.key)) return false;
  const t = fold(`${m.name} ${m.dose}`);
  return SALTS.some((w) => t.includes(w)) && !t.includes('elemental');
}

export function drugOf(name) {
  const hay = fold(name);
  return hay ? DRUG_RULES.find((r) => r.names.some((w) => hasWord(hay, w))) || null : null;
}

// Dosis escrita («1,000 UI», «50 mg», «25 mcg», «1 g») → cantidad en la unidad del límite del nutriente.
export function parseDose(dose, n) {
  const m = String(dose || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2').match(/(\d+(?:[.,]\d+)?)\s*(mcg|µg|ug|mg|g|ui|iu)\b/);
  if (!m || !n) return null;
  const v = Number(m[1].replace(',', '.'));
  let unit = m[2] === 'µg' || m[2] === 'ug' ? 'mcg' : m[2] === 'iu' ? 'ui' : m[2];
  let val = v;
  const want = n.ulUnit || (n.rda && n.rda.unit);
  if (!want) return null;
  if (unit === 'ui') {
    if (n.key !== 'vitd') return null; // las UI de A y E dependen de la forma: no se convierten
    val = v / 40; unit = 'mcg';
  }
  const f = { g: 1e6, mg: 1e3, mcg: 1 };
  if (!f[unit] || !f[want]) return null;
  return { value: (val * f[unit]) / f[want], unit: want };
}

// ---------- Horarios ----------

export function mealTimes(s) {
  const m = { ...DEFAULT_MEALS, ...((s.profile && s.profile.meals) || {}) };
  for (const k of Object.keys(DEFAULT_MEALS)) if (timeToMin(m[k]) == null) m[k] = DEFAULT_MEALS[k];
  return m;
}

export function setMealTimes(s, patch) {
  const cur = mealTimes(s);
  for (const k of Object.keys(DEFAULT_MEALS)) if (patch[k] !== undefined && timeToMin(patch[k]) != null) cur[k] = minToTime(timeToMin(patch[k]));
  s.profile.meals = cur;
}

export function slotTime(s, slot) {
  const m = mealTimes(s);
  if (slot === 'ayunas') return minToTime(Math.max(0, timeToMin(m.desayuno) - 30));
  if (slot === 'noche') return minToTime(Math.max(0, timeToMin(m.dormir) - 30));
  return m[slot] || m.desayuno;
}

// Hora sugerida para un nutriente (la dosis no se divide sola: eso lo decides tú o tu médico).
export function suggestTimes(s, n) {
  return [slotTime(s, n ? n.slot : 'desayuno')];
}

// En qué momento del día cae una hora (para agrupar el plan).
export function slotOf(s, time) {
  const t = timeToMin(time);
  const m = mealTimes(s);
  const marks = [['ayunas', timeToMin(m.desayuno) - 30], ['desayuno', timeToMin(m.desayuno)], ['almuerzo', timeToMin(m.almuerzo)], ['cena', timeToMin(m.cena)], ['noche', timeToMin(m.dormir) - 30]];
  let best = marks[0][0]; let diff = Infinity;
  for (const [k, v] of marks) { const dd = Math.abs(v - t); if (dd < diff) { diff = dd; best = k; } }
  return diff <= 60 ? best : 'entre';
}

// ---------- Tu plan: choques, medicinas y límites ----------

const minDiff = (a, b) => Math.abs(timeToMin(a) - timeToMin(b));
const closest = (as, bs) => { let d = Infinity; for (const a of as) for (const b of bs) d = Math.min(d, minDiff(a, b)); return d; };

// Revisa lo que tomas hoy (activo) y devuelve: items (cada suplemento con su nutriente), avisos ordenados
// por importancia y propuestas de hora. Nunca cambia nada solo.
export function supplementPlan(s) {
  const active = (s.meds || []).filter((m) => !m.archived);
  const items = active.map((m) => {
    const n = nutrientOf(m.name);
    const drug = n ? null : drugOf(m.name);
    const d = n && !saltOnly(m, n) ? parseDose(m.dose, n) : null;
    const perWeek = m.days ? m.days.length : 7;
    const daily = d ? (d.value * m.times.length * perWeek) / 7 : null;
    return { med: m, n, drug, dose: d, daily };
  });
  const warn = [];
  const nutr = items.filter((x) => x.n);
  // 1. Suplementos que se estorban a la misma hora (y medicinas que piden separarse).
  // Se propone mover primero a su momento recomendado; si no alcanza, al primer momento libre del día.
  const plan = Object.fromEntries(nutr.map((x) => [x.med.id, x.med.times]));
  const drugs = items.filter((y) => y.drug && y.drug.gap);
  const gapOf = (a, b) => {
    let h = 0;
    for (const [k, v] of a.n.gap || []) if (k === b.n.key || k === '*') h = Math.max(h, v);
    for (const [k, v] of b.n.gap || []) if (k === a.n.key || k === '*') h = Math.max(h, v);
    return h;
  };
  const fits = (x, t) => nutr.every((y) => y === x || y.n.key === x.n.key || !gapOf(x, y) || closest(t, plan[y.med.id]) >= gapOf(x, y) * 60)
    && drugs.every((d) => !d.drug.with.includes(x.n.key) || closest(t, d.med.times) >= d.drug.gap * 60);
  const move = (x, any) => {
    const want = suggestTimes(s, x.n);
    if (fits(x, want)) { plan[x.med.id] = want; return true; }
    if (!any || want.length > 1) return false;
    for (const sl of SLOTS) { const t = [slotTime(s, sl.key)]; if (fits(x, t)) { plan[x.med.id] = t; return true; } }
    // Ningún momento de comida sirve: la primera media hora libre entre el desayuno y la hora de dormir.
    const m = mealTimes(s);
    for (let v = timeToMin(m.desayuno); v <= timeToMin(m.dormir) - 30; v += 30) { const t = [minToTime(v)]; if (fits(x, t)) { plan[x.med.id] = t; return true; } }
    return false;
  };
  const conflicts = [];
  for (let i = 0; i < nutr.length; i++) {
    for (let j = i + 1; j < nutr.length; j++) {
      const a = nutr[i]; const b = nutr[j];
      if (a.n.key === b.n.key) continue;
      const hrs = gapOf(a, b);
      if (hrs && closest(a.med.times, b.med.times) < hrs * 60) conflicts.push([a, b, hrs]);
    }
  }
  // Avisos: el que «se separa de todo» (fibra) en un solo aviso; los demás, por pareja.
  const wide = new Map();
  for (const [a, b, hrs] of conflicts) {
    const w = (b.n.gap || []).some(([k]) => k === '*') ? b : (a.n.gap || []).some(([k]) => k === '*') ? a : null;
    if (w) { const o = w === a ? b : a; if (!wide.has(w)) wide.set(w, { hrs, list: [] }); wide.get(w).list.push(o); continue; }
    const dist = closest(a.med.times, b.med.times);
    warn.push({ level: 2, icon: 'clock', ids: [a.med.id, b.med.id], text: `${a.med.name} y ${b.med.name} están ${dist ? `a ${Math.round(dist / 6) / 10} h` : 'a la misma hora'}: sepáralos al menos ${hrs} horas para que se absorban bien.` });
  }
  for (const [w, { hrs, list }] of wide) warn.push({ level: 2, icon: 'clock', ids: [w.med.id, ...list.map((o) => o.med.id)], text: `${w.med.name} está a menos de ${hrs} horas de ${list.map((o) => o.med.name).join(', ')}: sepáralo para que no les reste absorción.` });
  for (const [a, b, hrs] of conflicts) {
    if (closest(plan[a.med.id], plan[b.med.id]) >= hrs * 60) continue;
    const order = (b.n.gap || []).some(([k]) => k === '*') ? [b, a] : [a, b];
    if (move(order[0], false) || move(order[1], false) || move(order[0], true) || move(order[1], true)) continue;
  }
  // Suplementos que hoy chocan con una medicina: también se proponen a un momento libre.
  for (const x of nutr) {
    const hit = drugs.some((d) => d.drug.with.includes(x.n.key) && closest(plan[x.med.id], d.med.times) < d.drug.gap * 60);
    if (hit) move(x, true);
  }
  const fix = {};
  for (const x of nutr) if (plan[x.med.id].join() !== x.med.times.join()) fix[x.med.id] = plan[x.med.id];
  // 2. Medicinas que se llevan mal con lo que tomas.
  for (const x of items.filter((y) => y.drug)) {
    const hit = nutr.filter((y) => x.drug.with.includes(y.n.key));
    if (!hit.length) continue;
    const near = x.drug.gap ? hit.filter((y) => closest(x.med.times, y.med.times) < x.drug.gap * 60) : [];
    warn.push({ level: near.length ? 3 : 1, icon: 'pill', ids: [x.med.id, ...hit.map((y) => y.med.id)],
      text: `${x.med.name} y ${hit.map((y) => y.med.name).join(', ')}: ${x.drug.text}${near.length ? ` Ahora mismo ${near.length === 1 ? 'está' : 'están'} a menos de ${x.drug.gap} ${x.drug.gap === 1 ? 'hora' : 'horas'}.` : ''}` });
  }
  // 3. Límites y tomas grandes.
  const byKey = {};
  for (const x of nutr) if (x.daily != null) byKey[x.n.key] = (byKey[x.n.key] || 0) + x.daily;
  for (const [k, total] of Object.entries(byKey)) {
    const n = NUTRIENT[k];
    if (n.ul && total > n.ul + 1e-9) warn.push({ level: 2, icon: 'info', ids: nutr.filter((x) => x.n.key === k).map((x) => x.med.id), text: `${n.name}: tomas cerca de ${fmtAmount(total, n.ulUnit)}${k === 'vitd' ? ` (${fmtAmount(total * 40, 'UI')})` : ''} al día y el límite para adultos es ${fmtAmount(n.ul, n.ulUnit)}${k === 'vitd' ? ' (4,000 UI)' : ''}. Está bien solo si te lo indicó tu médico, por un tiempo.` });
  }
  for (const x of nutr) {
    if (x.n.splitAt && x.dose && x.dose.value > x.n.splitAt) warn.push({ level: 1, icon: 'info', ids: [x.med.id], text: `${x.med.name}: el cuerpo absorbe mejor ${x.n.splitAt} mg o menos por toma. Si tu médico está de acuerdo, toma la mitad con el almuerzo y la mitad con la cena.` });
  }
  // 4. Momento recomendado (sin choque): hierro en la noche, magnesio en la mañana… solo como sugerencia suave.
  const tips = [];
  for (const x of nutr) {
    if (fix[x.med.id]) continue;
    const want = suggestTimes(s, x.n);
    if (x.med.times.length === want.length && closest(x.med.times, want) <= 60 && closest(want, x.med.times) <= 60) continue;
    if (x.med.times.length !== 1 || want.length !== 1) continue;
    tips.push({ id: x.med.id, name: x.med.name, from: x.med.times[0], to: want[0], slot: x.n.slot });
  }
  warn.sort((a, b) => b.level - a.level);
  return { items, warn, fix, tips, count: nutr.length };
}

// Aplica las horas propuestas (las de choques, y las sugerencias que se acepten).
export function applyPlanTimes(s, changes) {
  let n = 0;
  for (const [id, times] of Object.entries(changes || {})) {
    const m = (s.meds || []).find((x) => x.id === id);
    if (!m || !Array.isArray(times) || !times.length) continue;
    const t = [...new Set(times.map((v) => (timeToMin(v) != null ? minToTime(timeToMin(v)) : null)).filter(Boolean))].sort();
    if (t.length) { m.times = t; n += 1; }
  }
  return n;
}

// Tu día de tomas, en orden de hora y agrupado por hora, con el momento (en ayunas, con el almuerzo…).
export function planTimeline(s) {
  const by = new Map();
  for (const m of (s.meds || []).filter((x) => !x.archived)) {
    for (const t of m.times) {
      if (!by.has(t)) by.set(t, []);
      by.get(t).push({ med: m, n: nutrientOf(m.name) });
    }
  }
  return [...by.entries()].sort((a, b) => timeToMin(a[0]) - timeToMin(b[0])).map(([time, list]) => {
    const k = slotOf(s, time);
    return { time, slot: k, label: k === 'entre' ? 'Entre comidas' : SLOT[k].label, list };
  });
}

export function fmtAmount(v, unit) {
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r.toLocaleString('en-US')} ${unit}`;
}

export function rdaText(n) {
  if (!n.rda) return 'Según la etiqueta.';
  const u = n.rda.unit;
  const f = (v) => fmtAmount(v, u);
  const base = n.rda.h === n.rda.m ? `${f(n.rda.h)} al día` : `${f(n.rda.m)} mujeres · ${f(n.rda.h)} hombres`;
  return `${base}${n.rda.alt ? ` (${n.rda.alt})` : ''}`;
}
