// Léxico de compras (1.13): pasillos del súper, unidades, catálogo de productos de uso común en República Dominicana
// y el analizador de frases («2 lb de pollo, pan y leche»). Es puro: no depende del estado ni de otros módulos,
// así lo pueden usar el registro por voz, la lista y las pruebas.

export const norm = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Pasillos en el orden en que suelen recorrerse en un supermercado.
export const AISLES = [
  { id: 'viveres', name: 'Víveres y vegetales', icon: 'sprout' },
  { id: 'frutas', name: 'Frutas', icon: 'heart' },
  { id: 'carnes', name: 'Carnes, pollo y pescado', icon: 'utensils' },
  { id: 'embutidos', name: 'Embutidos y quesos', icon: 'box' },
  { id: 'lacteos', name: 'Lácteos y huevos', icon: 'drop' },
  { id: 'panaderia', name: 'Pan y panadería', icon: 'coffee' },
  { id: 'granos', name: 'Arroz, granos y pastas', icon: 'bag' },
  { id: 'despensa', name: 'Despensa y condimentos', icon: 'flask' },
  { id: 'enlatados', name: 'Enlatados y salsas', icon: 'archive' },
  { id: 'desayuno', name: 'Café y desayuno', icon: 'coffee' },
  { id: 'snacks', name: 'Snacks y dulces', icon: 'gift' },
  { id: 'bebidas', name: 'Bebidas y agua', icon: 'glass' },
  { id: 'congelados', name: 'Congelados', icon: 'snow' },
  { id: 'limpieza', name: 'Limpieza', icon: 'broom' },
  { id: 'higiene', name: 'Higiene y cuidado personal', icon: 'user' },
  { id: 'bebe', name: 'Bebé', icon: 'baby' },
  { id: 'mascotas', name: 'Mascotas', icon: 'paw' },
  { id: 'farmacia', name: 'Farmacia y salud', icon: 'pill' },
  { id: 'hogar', name: 'Hogar y cocina', icon: 'home' },
  { id: 'otros', name: 'Otros', icon: 'tag' },
];
export const AISLE_IDS = AISLES.map((a) => a.id);
export const aisleOf = (id) => AISLES.find((a) => a.id === id) || AISLES[AISLES.length - 1];
export const aisleIndex = (id) => { const i = AISLE_IDS.indexOf(id); return i < 0 ? AISLE_IDS.length - 1 : i; };

// Unidades. `count`: se cuenta por piezas o paquetes (el precio es de cada una); si no, el precio es por esa medida.
export const UNITS = [
  { k: 'u', one: 'unidad', many: 'unidades', short: 'ud', words: ['u', 'ud', 'uds', 'unidad', 'unidades', 'pieza', 'piezas', 'pza', 'pzas'], count: true },
  { k: 'lb', one: 'libra', many: 'libras', short: 'lb', words: ['lb', 'lbs', 'libra', 'libras'] },
  { k: 'kg', one: 'kilo', many: 'kilos', short: 'kg', words: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'] },
  { k: 'g', one: 'gramo', many: 'gramos', short: 'g', words: ['g', 'gr', 'grs', 'gramo', 'gramos'] },
  { k: 'oz', one: 'onza', many: 'onzas', short: 'oz', words: ['oz', 'onza', 'onzas'] },
  { k: 'l', one: 'litro', many: 'litros', short: 'L', words: ['l', 'lt', 'lts', 'litro', 'litros'] },
  { k: 'ml', one: 'mililitro', many: 'mililitros', short: 'ml', words: ['ml', 'mililitro', 'mililitros'] },
  { k: 'gal', one: 'galón', many: 'galones', short: 'gal', words: ['gal', 'galon', 'galones'] },
  { k: 'doc', one: 'docena', many: 'docenas', short: 'doc', words: ['doc', 'docena', 'docenas'], count: true },
  { k: 'paq', one: 'paquete', many: 'paquetes', short: 'paq', words: ['paq', 'paquete', 'paquetes', 'pack', 'packs'], count: true },
  { k: 'funda', one: 'funda', many: 'fundas', short: 'funda', words: ['funda', 'fundas', 'bolsa', 'bolsas'], count: true },
  { k: 'lata', one: 'lata', many: 'latas', short: 'lata', words: ['lata', 'latas', 'latica', 'laticas'], count: true },
  { k: 'caja', one: 'caja', many: 'cajas', short: 'caja', words: ['caja', 'cajas', 'cajita', 'cajitas'], count: true },
  { k: 'bot', one: 'botella', many: 'botellas', short: 'bot', words: ['bot', 'botella', 'botellas', 'botellon', 'botellones'], count: true },
  { k: 'frasco', one: 'frasco', many: 'frascos', short: 'frasco', words: ['frasco', 'frascos', 'pote', 'potes'], count: true },
  { k: 'atado', one: 'atado', many: 'atados', short: 'atado', words: ['atado', 'atados', 'atadito', 'atadito', 'manojo', 'manojos'], count: true },
  { k: 'mano', one: 'mano', many: 'manos', short: 'mano', words: ['mano', 'manos'], count: true },
  { k: 'rollo', one: 'rollo', many: 'rollos', short: 'rollo', words: ['rollo', 'rollos'], count: true },
  { k: 'sobre', one: 'sobre', many: 'sobres', short: 'sobre', words: ['sobre', 'sobres', 'sobrecito', 'sobrecitos'], count: true },
  { k: 'saco', one: 'saco', many: 'sacos', short: 'saco', words: ['saco', 'sacos', 'quintal', 'quintales'], count: true },
  { k: 'bandeja', one: 'bandeja', many: 'bandejas', short: 'bandeja', words: ['bandeja', 'bandejas'], count: true },
  { k: 'cabeza', one: 'cabeza', many: 'cabezas', short: 'cabeza', words: ['cabeza', 'cabezas'], count: true },
];
export const unitOf = (k) => UNITS.find((u) => u.k === k) || null;
export const isCountUnit = (k) => { const u = unitOf(k); return !u || !!u.count; };
const UNIT_WORD = new Map(UNITS.flatMap((u) => u.words.map((w) => [w, u.k])));

const fmtQty = (q) => {
  const n = Number(q);
  if (!(n > 0)) return '';
  const w = Math.floor(n);
  const f = Math.round((n - w) * 100) / 100;
  const frac = f === 0.5 ? '½' : f === 0.25 ? '¼' : f === 0.75 ? '¾' : '';
  if (frac) return w ? `${w} ${frac}` : frac;
  return String(Math.round(n * 100) / 100);
};
// «2 lb», «3 latas», «1 docena», «2» (sin unidad).
export function qtyText(qty, unit) {
  const q = fmtQty(qty);
  const u = unitOf(unit);
  if (!q && !u) return '';
  if (!u || unit === 'u') return q && Number(qty) !== 1 ? q : q === '1' ? '' : q;
  if (!q) return u.short;
  return ['lb', 'kg', 'g', 'oz', 'l', 'ml', 'gal'].includes(u.k) ? `${q} ${u.short}` : `${q} ${Number(qty) === 1 ? u.one : u.many}`;
}

// ---------- Catálogo ----------
// Formato: «pasillo|Nombre|unidad|días que dura|básico (b)|otros nombres separados por ;»

const RAW = `
viveres|Plátano verde|u|7|b|platano;platanos;platano verde;platanos verdes;verde
viveres|Plátano maduro|u|5||platano maduro;maduro;maduros;platanos maduros
viveres|Yuca|lb|10||
viveres|Batata|lb|14||
viveres|Ñame|lb|14||name
viveres|Yautía|lb|14||yautia
viveres|Auyama|lb|14||calabaza
viveres|Papa|lb|20|b|papas
viveres|Cebolla|lb|20|b|cebollas
viveres|Ajo|cabeza|30|b|ajos;cabeza de ajo
viveres|Tomate|lb|7|b|tomates
viveres|Ají cubanela|lb|7||aji;aji cubanela;aji gustoso;ajies
viveres|Pimiento|u|7||pimientos;pimenton;morron
viveres|Zanahoria|lb|14||zanahorias
viveres|Repollo|u|14||col
viveres|Lechuga|u|7||
viveres|Pepino|u|7||pepinos
viveres|Berenjena|u|7||berenjenas
viveres|Chayote|u|10||chayotes
viveres|Molondrón|lb|7||molondron;quimbombo
viveres|Vainitas|lb|5||vainita;habichuelas verdes
viveres|Brócoli|u|5||brocoli
viveres|Coliflor|u|7||
viveres|Remolacha|lb|14||remolachas
viveres|Apio|u|10||celery
viveres|Cilantro|atado|5|b|cilantrico;cilantro ancho
viveres|Culantro|atado|5||
viveres|Perejil|atado|5||
viveres|Cebollín|atado|7||cebollin;cebolleta
viveres|Limón|lb|14||limon;limones
viveres|Jengibre|u|21||
viveres|Maíz|u|5||maiz;mazorca
viveres|Guandules verdes|lb|5||guandul;guandules;guandul verde
viveres|Ensalada|funda|5||ensalada mixta;mix de ensalada
frutas|Guineo|mano|7||guineos;banano;bananos;banana
frutas|Manzana|u|14||manzanas
frutas|Naranja|u|14||naranjas
frutas|Mandarina|u|14||mandarinas
frutas|Piña|u|7||pina;pinas
frutas|Melón|u|7||melon
frutas|Sandía|u|7||sandia
frutas|Lechosa|u|7||papaya
frutas|Aguacate|u|5||aguacates
frutas|Mango|u|5||mangos
frutas|Chinola|u|7||maracuya;chinolas
frutas|Fresas|bandeja|5||fresa
frutas|Uvas|lb|7||uva
frutas|Pera|u|10||peras
frutas|Coco|u|14||cocos
frutas|Cereza|lb|5||cerezas
carnes|Pollo|lb|3|b|pollo entero;pollo fresco
carnes|Pechuga de pollo|lb|3||pechuga;pechugas
carnes|Muslos de pollo|lb|3||muslos;muslitos;contramuslos
carnes|Alitas de pollo|lb|3||alitas;alas
carnes|Carne de res|lb|3||res;carne;carne de rez;bistec
carnes|Carne molida|lb|2||molida
carnes|Chuleta|lb|3||chuletas;chuleta de cerdo
carnes|Costillas de cerdo|lb|3||costillas;costilla
carnes|Longaniza|lb|7||
carnes|Pescado|lb|2||filete de pescado;dorado;chillo
carnes|Camarones|lb|2||camaron
carnes|Salmón|lb|2||salmon
carnes|Chivo|lb|3||
carnes|Pavo|lb|3||
carnes|Hígado|lb|2||higado
carnes|Cerdo|lb|3||carne de cerdo;pernil
embutidos|Salami|lb|14||salami dominicano
embutidos|Jamón|lb|10||jamon;jamon de pavo;jamon de cerdo
embutidos|Mortadela|lb|10||
embutidos|Salchichas|paq|14||salchicha;vienna;hot dogs;hotdog
embutidos|Tocino|paq|14||bacon
embutidos|Queso de freír|lb|21||queso de freir;queso frito;queso de hoja
embutidos|Queso blanco|lb|14||queso
embutidos|Queso amarillo|lb|21||cheddar;queso cheddar;queso amarillo
embutidos|Queso mozzarella|paq|21||mozzarella;mozarela;queso mozarela;queso para pizza
embutidos|Queso crema|u|21||cream cheese;philadelphia
embutidos|Queso rallado|paq|30||parmesano
embutidos|Pepperoni|paq|21||
lacteos|Leche|l|10|b|leche entera;leche fresca;leche liquida
lacteos|Leche en polvo|lata|180||leche polvo;nido
lacteos|Leche evaporada|lata|365||evaporada
lacteos|Leche condensada|lata|365||condensada
lacteos|Leche de almendras|l|120||leche de almendra;leche vegetal
lacteos|Yogurt|u|14||yogur;yogurt griego
lacteos|Mantequilla|u|60||mantequilla;butter
lacteos|Margarina|u|60||
lacteos|Crema de leche|u|14||crema
lacteos|Huevos|doc|25|b|huevo;carton de huevos
lacteos|Avena líquida|l|10||avena en leche
panaderia|Pan|funda|5|b|pan de molde;pan sobao;pan de agua;pan fresco
panaderia|Pan integral|funda|7||
panaderia|Pan de hamburguesa|funda|7||pan de hamburguesas;pan hamburguesa
panaderia|Pan de hot dog|funda|7||pan de perro;pan de hot dogs
panaderia|Tortillas|paq|10||tortilla;wraps
panaderia|Galletas de soda|paq|120||galletas saladas;saltinas;soda
panaderia|Bizcocho|u|4||torta;cake
panaderia|Tostadas|paq|60||tostada
granos|Arroz|lb|365|b|arroz blanco;arroz selecto
granos|Habichuelas rojas|lb|365|b|habichuelas;habichuela;frijoles;habichuelas coloradas
granos|Habichuelas negras|lb|365||frijoles negros
granos|Habichuelas blancas|lb|365||
granos|Lentejas|lb|365||lenteja
granos|Guandules secos|lb|365||guandul seco
granos|Garbanzos|lb|365||garbanzo
granos|Espagueti|paq|365|b|spaghetti;espaguetis;pasta;espagueti
granos|Macarrones|paq|365||macarron;coditos;penne;rigatoni
granos|Fideos|paq|365||fideo
granos|Avena|paq|365||avena en hojuelas;hojuelas de avena;quaker
granos|Harina de trigo|lb|365||harina
granos|Harina de maíz|lb|365||harina de maiz;harina para tostones
granos|Cereal|caja|180||cereales;corn flakes;cheerios
granos|Cuscús|paq|365||cuscus
despensa|Aceite|bot|365|b|aceite vegetal;aceite de cocinar;aceite de girasol
despensa|Aceite de oliva|bot|365||
despensa|Vinagre|bot|365||
despensa|Sal|u|1000|b|sal de mesa
despensa|Azúcar|lb|1000|b|azucar;azucar crema;azucar blanca;azucar morena
despensa|Pimienta|u|365||pimienta negra
despensa|Orégano|u|365||oregano;oregano seco;oregano brujo
despensa|Adobo|u|365|b|adobo completo
despensa|Sazón completo|u|365||sazon;sazon completo;sazonador
despensa|Sazón líquido|u|365||sazon liquido;sazon liquida
despensa|Ajo en polvo|u|365||
despensa|Canela|u|365||canela en polvo;canela en rama
despensa|Comino|u|365||
despensa|Laurel|u|365||hojas de laurel
despensa|Bijol|u|365||achiote
despensa|Consomé|sobre|365||consome;caldo;caldo de pollo;maggi;cubito;cubitos
despensa|Mayonesa|frasco|120||mayo
despensa|Kétchup|frasco|180||ketchup;catsup;salsa de tomate de mesa
despensa|Mostaza|frasco|180||
despensa|Salsa de soya|frasco|365||salsa soya;soya
despensa|Salsa inglesa|frasco|365||salsa worcestershire;worcestershire
despensa|Salsa BBQ|frasco|180||barbacoa;bbq
despensa|Vainilla|frasco|365||esencia de vainilla
despensa|Polvo de hornear|u|365||royal
despensa|Maicena|u|365||almidon de maiz
despensa|Aceitunas|frasco|365||aceituna;alcaparras
despensa|Pasas|paq|180||pasas;uvas pasas
enlatados|Atún|lata|730||atun
enlatados|Sardinas|lata|730||sardina
enlatados|Salchichas enlatadas|lata|730||vienna enlatada
enlatados|Maíz dulce|lata|730||maiz dulce;maiz en lata
enlatados|Petit pois|lata|730||guisantes;petit pois;arvejas
enlatados|Habichuelas enlatadas|lata|730||habichuelas en lata
enlatados|Salsa de tomate|lata|730|b|salsa tomate;salsa de tomate en lata
enlatados|Pasta de tomate|lata|730|b|pasta tomate;tomato paste
enlatados|Tomate triturado|lata|730||tomates triturados
enlatados|Sopa instantánea|u|365||sopa;sopita;sopas;noodles
enlatados|Mermelada|frasco|365||jalea;mermelada de fresa
enlatados|Mantequilla de maní|frasco|365||mantequilla de mani;crema de mani
enlatados|Frutas en almíbar|lata|730||durazno;cocktail de frutas
desayuno|Café|lb|365|b|cafe;cafe molido;cafe santo domingo
desayuno|Té|caja|365||te;te verde;manzanilla;te de manzanilla
desayuno|Chocolate|u|365||cacao;chocolate de leche;chocolate en barra
desayuno|Leche achocolatada|u|180||chocolate en polvo;milo;nesquik
desayuno|Miel|frasco|1000||miel de abeja
desayuno|Endulzante|caja|365||splenda;stevia
snacks|Galletas|paq|120||galleta;galletas dulces;oreo
snacks|Papitas|funda|90||papitas fritas;chips;doritos;platanitos;tostitos
snacks|Maní|funda|180||mani;mani tostado
snacks|Caramelos|funda|365||dulces;caramelo;chicles;chicle;gomitas
snacks|Barras de cereal|caja|180||barra de cereal;granola
snacks|Palomitas|paq|180||cotufas;palomitas de maiz;popcorn
snacks|Chocolates|u|180||chocolatina
bebidas|Agua|bot|365|b|botellon;botellon de agua;agua purificada;agua de botellon;garrafon
bebidas|Agua en botellitas|paq|365||botellitas de agua;agua embotellada;pack de agua
bebidas|Refresco|u|365||gaseosa;soda;coca cola;coca-cola;pepsi;refrescos;malta
bebidas|Jugo|u|30||jugos;jugo de naranja;jugo de manzana
bebidas|Cerveza|caja|365||cervezas;presidente;bohemia
bebidas|Ron|bot|1000||brugal;barcelo;ron dominicano
bebidas|Vino|bot|1000||
bebidas|Bebida energética|u|365||energizante;red bull;gatorade
congelados|Helado|u|180||helados;helado de vainilla
congelados|Papas fritas congeladas|funda|180||papas congeladas;french fries
congelados|Vegetales congelados|funda|180||vegetales mixtos congelados
congelados|Pizza congelada|u|120||pizza
congelados|Empanadas|paq|90||empanadas congeladas;pastelitos;croquetas
congelados|Hielo|funda|30||fundas de hielo;hielo en cubos
limpieza|Detergente|funda|730|b|detergente en polvo;jabon en polvo;ariel;persil
limpieza|Suavizante|u|730||suavizante de ropa;downy
limpieza|Cloro|gal|730|b|blanqueador;cloro liquido;clorox
limpieza|Desinfectante|gal|730||fabuloso;mistolin;lysol;desinfectante de pisos
limpieza|Lavaplatos|u|730|b|jabon de fregar;jabon lavaplatos;fregar;jabon liquido de platos;axion
limpieza|Esponja|paq|730||esponjas;estropajo;fibra
limpieza|Papel toalla|rollo|730||papel de cocina;toallas de papel
limpieza|Bolsas de basura|paq|730|b|fundas de basura;bolsas para basura;funda de basura
limpieza|Ambientador|u|730||desodorante ambiental;glade;air wick
limpieza|Limpiavidrios|u|730||limpia vidrios;windex
limpieza|Insecticida|u|730||raid;mata cucarachas
limpieza|Jabón de lavar|u|730||jabon de barra;jabon de cuaba
limpieza|Escoba|u|1000||mopa;trapeador;suape;cepillo
higiene|Papel higiénico|paq|1000|b|papel de baño;papel de bano;papel higienico;papel sanitario
higiene|Jabón de baño|u|730|b|jabon;jabon de bano;jabon de ducha
higiene|Champú|u|730|b|shampoo;champu;sampu
higiene|Acondicionador|u|730||enjuague;crema de enjuague
higiene|Pasta dental|u|730|b|crema dental;pasta de dientes;colgate
higiene|Cepillo de dientes|u|730||cepillo dental
higiene|Desodorante|u|730|b|desodorante en barra;roll on
higiene|Crema corporal|u|730||crema;locion;locion corporal;hidratante
higiene|Afeitadora|paq|1000||maquinilla;rastrillo;gillette
higiene|Toallas sanitarias|paq|1000||toallas femeninas;tampones;protectores diarios
higiene|Servilletas|paq|1000||servilleta
higiene|Pañuelos desechables|paq|1000||panuelos;kleenex;pañuelos
higiene|Enjuague bucal|u|730||listerine
higiene|Protector solar|u|730||bloqueador;bloqueador solar
higiene|Cotonetes|paq|1000||hisopos;cotonetes;q-tips
bebe|Pañales|paq|1000||panales;pampers;huggies;panal
bebe|Toallitas húmedas|paq|730||toallitas;wipes;toallitas humedas
bebe|Fórmula infantil|lata|365||formula;leche de bebe;nan;enfamil;similac
bebe|Compotas|u|365||compota;cereal de bebe;papillas
mascotas|Comida de perro|saco|365||comida para perro;perrarina;concentrado de perro;dog food
mascotas|Comida de gato|saco|365||comida para gato;gatarina;cat food
mascotas|Arena para gatos|saco|1000||arena sanitaria;arena de gato
farmacia|Acetaminofén|caja|730||acetaminofen;tylenol;panadol;paracetamol
farmacia|Ibuprofeno|caja|730||advil;motrin
farmacia|Vitaminas|u|365||vitamina c;multivitaminico;multivitaminas;suplemento
farmacia|Alcohol|bot|1000||alcohol isopropilico;alcohol antiseptico
farmacia|Curitas|caja|1000||bandas;vendas;curitas
farmacia|Suero oral|u|365||pedialyte;suero
farmacia|Mascarillas|caja|730||mascarilla;tapabocas
hogar|Bombillos|u|1000||bombillo;bombilla;luz led;lamparas
hogar|Pilas|paq|1000||baterias;pila;bateria
hogar|Fósforos|caja|1000||fosforos;encendedor;fosforo
hogar|Velas|paq|1000||vela;velon;velones
hogar|Papel aluminio|rollo|1000||aluminio;foil;papel de aluminio
hogar|Papel film|rollo|1000||plastico de envolver;film;papel plastico
hogar|Bolsas ziploc|caja|1000||ziploc;bolsitas;fundas ziploc
hogar|Vasos desechables|paq|1000||vasos plasticos;platos desechables;cubiertos desechables;vasitos
hogar|Carbón|funda|1000||carbon;leña;lena
`;

function build() {
  const out = [];
  for (const line of RAW.split('\n')) {
    const p = line.trim();
    if (!p) continue;
    const [aisle, name, unit, shelf, flag, alias] = p.split('|');
    const names = [name, ...(alias ? alias.split(';') : [])].map(norm).filter(Boolean);
    out.push({ key: norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, aisle, unit, shelf: Number(shelf) || 0, basic: flag === 'b', names: [...new Set(names)] });
  }
  return out;
}
export const CATALOG = build();
const BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));
export const productOf = (key) => BY_KEY.get(key) || null;

// Básicos de una casa dominicana: lo que casi siempre hay que tener.
export const BASICS = CATALOG.filter((c) => c.basic);

// Singular sencillo: «plátanos» → «platano», «huevos» → «huevo», «ajíes» → «aji».
function singular(w) {
  if (w.length > 4 && w.endsWith('es') && /(on|or|al|ar|ur|ie|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'para', 'con', 'en', 'al']);
const tokens = (t) => norm(t).split(/[^a-z0-9ñ]+/).filter((w) => w && !STOP.has(w)).map(singular);
const tokKey = (t) => tokens(t).join(' ');

const INDEX = (() => {
  const m = new Map();
  for (const c of CATALOG) for (const n of c.names) { const k = tokKey(n); if (k && !m.has(k)) m.set(k, c); }
  return m;
})();

// Busca el producto del catálogo que mejor corresponde a lo que escribiste.
// Coincidencia exacta; si no, el nombre más largo cuyas palabras estén todas en lo escrito («pollo entero» → Pollo).
export function matchProduct(text) {
  const k = tokKey(text);
  if (!k) return null;
  if (INDEX.has(k)) return INDEX.get(k);
  const words = k.split(' ');
  let best = null;
  let bestLen = 0;
  for (const [name, c] of INDEX) {
    const nw = name.split(' ');
    if (nw.length > words.length) continue;
    if (!nw.every((w) => words.includes(w))) continue;
    const len = nw.join('').length;
    if (len > bestLen) { best = c; bestLen = len; }
  }
  // Una sola palabra suelta que apenas se parece no cuenta («salsa» no es «Salsa de tomate»).
  return best;
}

// Palabras que empiezan con lo escrito (para sugerir mientras escribes).
export function suggestProducts(text, limit = 6) {
  const q = tokKey(text);
  if (q.length < 2) return [];
  const raw = norm(text);
  const out = [];
  for (const c of CATALOG) {
    const nm = norm(c.name);
    const hit = nm.startsWith(raw) || nm.split(' ').some((w) => w.startsWith(raw)) || c.names.some((n) => n.startsWith(raw));
    if (hit) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Analizador de frases ----------

const NUMW = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, media: 0.5, medio: 0.5 };

function num(t) {
  const s = String(t).trim();
  if (/^\d+\s*\/\s*\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return NUMW[norm(s)] != null ? NUMW[norm(s)] : null;
}

const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// Un artículo: «2 lb de pollo», «pollo 2 libras», «3 plátanos», «leche x2», «1 docena de huevos», «media libra de queso».
export function parseShopItem(text) {
  let t = String(text || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().replace(/^[-–•*·]+\s*/, '').replace(/[.!¡?¿]+$/g, '').trim();
  if (!t) return null;
  let qty = null;
  let unit = null;
  let m;
  // «leche x2» o «x2 leche»
  if ((m = t.match(/^(.+?)\s+x\s?(\d+(?:[.,]\d+)?)$/i))) { t = m[1]; qty = num(m[2]); }
  else if ((m = t.match(/^x\s?(\d+(?:[.,]\d+)?)\s+(.+)$/i))) { qty = num(m[1]); t = m[2]; }
  // Cantidad al inicio: número, fracción o palabra («dos», «media»).
  if (qty == null && (m = t.match(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|media|medio)\b\s*(.*)$/i))) {
    const q = num(m[1]);
    if (q != null) {
      qty = q;
      t = m[2];
      // «1 y media», «2 y medio»
      const half = t.match(/^y\s+(media|medio)\b\s*(.*)$/i);
      if (half) { qty += 0.5; t = half[2]; }
      // Unidad pegada o separada: «2lb», «2 lb», «2 libras de»
      const um = t.match(/^([a-zñáéíóú]+)\b\.?\s*(.*)$/i);
      if (um && UNIT_WORD.has(norm(um[1]))) { unit = UNIT_WORD.get(norm(um[1])); t = um[2]; }
      t = t.replace(/^de\s+/i, '');
    }
  }
  // Cantidad con unidad pegada al número: «2lb pollo», «5kg arroz»
  if (qty == null && (m = t.match(/^(\d+(?:[.,]\d+)?)([a-z]{1,3})\s+(.+)$/i)) && UNIT_WORD.has(norm(m[2]))) { qty = num(m[1]); unit = UNIT_WORD.get(norm(m[2])); t = m[3]; }
  // Cantidad al final: «pollo 2 libras», «huevos 2»
  if (qty == null && (m = t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zñáéíóú]+)?$/i))) {
    const u = m[3] ? UNIT_WORD.get(norm(m[3])) : null;
    if (!m[3] || u) { qty = num(m[2]); unit = u || null; t = m[1]; }
  }
  t = t.replace(/^(?:de|del)\s+/i, '').replace(/\s*\(([^)]*)\)\s*$/, '').trim();
  const note = (text.match(/\(([^)]*)\)\s*$/) || [])[1] || '';
  if (!t || /^\d+$/.test(t)) return null;
  const prod = matchProduct(t);
  return {
    name: prod && norm(t) === norm(prod.name) ? prod.name : prod && tokKey(t) === tokKey(prod.name) ? prod.name : cap(t.slice(0, 60)),
    qty: qty != null && qty > 0 ? Math.min(qty, 999) : null,
    unit,
    note: note.slice(0, 80),
    key: prod ? prod.key : null,
    aisle: prod ? prod.aisle : null,
    prod,
  };
}

// Una frase con varios artículos: «leche, 2 lb de pollo y pan». Se separa por comas, saltos de línea, punto y coma y « y ».
export function parseShopLine(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parts = raw.split(/[\n;]+|,\s*(?![^()]*\))/).flatMap((p) => {
    // «y» separa dos artículos solo si ninguno de los lados es un número solo («1 y media» no se parte).
    const bits = p.split(/\s+y\s+(?=[a-záéíóúñ])/i);
    return bits.length > 1 && !/\b(?:\d+|un|una|dos|tres)\s+y\s+(?:media|medio)\b/i.test(p) ? bits : [p];
  });
  return parts.map(parseShopItem).filter(Boolean).slice(0, 80);
}

// Frases del registro rápido: «agrega leche a la lista», «falta café», «se acabó el aceite», «hay que comprar pan».
const ADD_RE = /^\s*(?:(?:por favor\s+)?(?:agrega(?:r|me)?|a[ñn]ade|a[ñn]adir|apunta(?:r)?|anota(?:r)?|pon(?:er)?|mete|incluye)\s+(.+?)\s+(?:a|en|para)\s+(?:la\s+)?(?:mi\s+)?lista(?:\s+(?:de(?:l)?\s+)?(?:compras?|s[uú]per|supermercado|mercado|colmado))?)\s*$/i;
const NEED_RE = /^\s*(?:(?:me\s+)?(?:falta(?:n)?|hace\s+falta(?:n)?|necesito|necesitamos|hay\s+que\s+comprar|tengo\s+que\s+comprar|debo\s+comprar|toca\s+comprar|comprar|compra(?:r)?\s+(?:de\s+)?))\s+(.+)$/i;
const OUT_RE = /^\s*(?:(?:ya\s+)?(?:se\s+(?:me\s+|nos\s+)?(?:acab[óo]|termin[óo]|acabaron|terminaron|agot[óo])|no\s+(?:hay|queda(?:n)?|tengo|tenemos))\s+(?:el\s+|la\s+|los\s+|las\s+|m[aá]s\s+)?(.+))\s*$/i;

// Devuelve { items, out } o null si la frase no habla de compras.
export function parseShopPhrase(text) {
  const raw = String(text || '').trim();
  let m = raw.match(OUT_RE);
  if (m) {
    const items = parseShopLine(m[1]);
    // «no tengo tiempo» no es una compra: solo vale si lo que sigue es un producto conocido.
    if (items.length && items.every((i) => i.prod)) return { items, out: true };
    return null;
  }
  m = raw.match(ADD_RE);
  if (m) { const items = parseShopLine(m[1]); return items.length ? { items, out: false } : null; }
  m = raw.match(NEED_RE);
  if (m) {
    const items = parseShopLine(m[1]);
    // «necesito descansar», «comprar un carro»: solo si se parece a productos de súper.
    if (items.length && items.every((i) => i.prod || (!/\d{4,}/.test(i.name) && i.name.split(' ').length <= 3 && /^(?:comprar|compra|falta|faltan)/i.test(raw)))) {
      if (items.some((i) => i.prod)) return { items, out: false };
    }
  }
  return null;
}
