import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Normalización de texto ───────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Distancia de Levenshtein para fuzzy matching ─────────────────────────────
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(query: string, target: string, threshold = 0.35): boolean {
  const nq = normalize(query);
  const nt = normalize(target);
  if (nt.includes(nq)) return true;
  const dist = levenshtein(nq, nt.slice(0, Math.min(nt.length, nq.length + 3)));
  return dist <= Math.max(1, Math.floor(nq.length * threshold));
}

// ─── Mapa ampliado de corrección de typos ─────────────────────────────────────
const TYPO_MAP: Record<string, string> = {
  paracetamol: 'paracetamol',
  paracetanol: 'paracetamol',
  paracetam: 'paracetamol',
  ibuprofeno: 'ibuprofeno',
  iboprufeno: 'ibuprofeno',
  ibuprofero: 'ibuprofeno',
  ibu: 'ibuprofeno',
  amoxicilina: 'amoxicilina',
  amoxisilina: 'amoxicilina',
  amoxicilin: 'amoxicilina',
  fievre: 'fiebre',
  fiebre: 'fiebre',
  fiebr: 'fiebre',
  gripe: 'gripe',
  gripa: 'gripe',
  gripes: 'gripe',
  dolor: 'dolor',
  dolores: 'dolor',
  dplor: 'dolor',
  tos: 'tos',
  toce: 'tos',
  toss: 'tos',
  alerjia: 'alergia',
  alergia: 'alergia',
  alergico: 'alergia',
  alergicos: 'alergia',
  diabetis: 'diabetes',
  diabetes: 'diabetes',
  diabet: 'diabetes',
  presion: 'presion',
  presión: 'presion',
  presio: 'presion',
  hipertension: 'hipertension',
  hipertensión: 'hipertension',
  hiperten: 'hipertension',
  tencion: 'tension',
  antibiotico: 'antibiotico',
  antibiótico: 'antibiotico',
  antibiotico: 'antibiotico',
  vitamina: 'vitamina',
  vitaminas: 'vitamina',
  vitamima: 'vitamina',
  antiinflamatorio: 'antiinflamatorio',
  antiinflamatorios: 'antiinflamatorio',
  analgesico: 'analgesico',
  analgésico: 'analgesico',
  analgésicos: 'analgesico',
  antipiretico: 'antipiretico',
  antipiréticos: 'antipiretico',
  antipiretico: 'antipiretico',
  estomago: 'estomago',
  estómago: 'estomago',
  estomago: 'estomago',
  gastritis: 'gastritis',
  gastri: 'gastritis',
  diarrea: 'diarrea',
  diarea: 'diarrea',
  nausea: 'nausea',
  náusea: 'nausea',
  vomito: 'vomito',
  vómito: 'vomito',
  insomnio: 'insomnio',
  ansiedad: 'ansiedad',
  depresion: 'depresion',
  depresión: 'depresion',
  colesterol: 'colesterol',
  tiroides: 'tiroides',
  asma: 'asma',
  bronquitis: 'bronquitis',
  sinusitis: 'sinusitis',
  infeccion: 'infeccion',
  infección: 'infeccion',
  herida: 'herida',
  cicatriz: 'cicatriz',
  crema: 'crema',
  cremas: 'crema',
  jarabe: 'jarabe',
  jarabes: 'jarabe',
  capsula: 'capsula',
  cápsula: 'capsula',
  capsulas: 'capsula',
  tableta: 'tableta',
  tabletas: 'tableta',
  pastilla: 'pastilla',
  pastillas: 'pastilla',
  inyeccion: 'inyeccion',
  inyección: 'inyeccion',
  inyecion: 'inyeccion',
  suero: 'suero',
  sueros: 'suero',
  stock: 'stock',
  inventario: 'inventario',
  disponible: 'disponible',
  disponibles: 'disponible',
  tienes: 'tienes',
  hay: 'hay',
  para: 'para',
  tien: 'tienes',
  cabeza: 'cabeza',
  migraña: 'migraña',
  migra: 'migraña',
  resfriado: 'resfriado',
  resfrio: 'resfriado',
  congestion: 'congestion',
  congestión: 'congestion',
  catarro: 'catarro',
  acidez: 'acidez',
  reflujo: 'reflujo',
  colitis: 'colitis',
  estrenimiento: 'estrenimiento',
  estrenido: 'estrenimiento',
  laxante: 'laxante',
  vitamina_c: 'vitamina c',
  vitamina_d: 'vitamina d',
  calcio: 'calcio',
  hierro: 'hierro',
  omeprazol: 'omeprazol',
  ranitidina: 'ranitidina',
  loperamida: 'loperamida',
  loratadina: 'loratadina',
  cetirizina: 'cetirizina',
  diclofenaco: 'diclofenaco',
  ketorolaco: 'ketorolaco',
  naproxeno: 'naproxeno',
  meloxicam: 'meloxicam',
  prednisona: 'prednisona',
  dexametasona: 'dexametasona',
  fluconazol: 'fluconazol',
  clotrimazol: 'clotrimazol',
  metronidazol: 'metronidazol',
  azitromicina: 'azitromicina',
  ciprofloxacino: 'ciprofloxacino',
  doxiciclina: 'doxiciclina',
  metformina: 'metformina',
  glibenclamida: 'glibenclamida',
  enalapril: 'enalapril',
  losartan: 'losartan',
  amlodipino: 'amlodipino',
  atenolol: 'atenolol',
  captopril: 'captopril',
  furosemida: 'furosemida',
  hidroclorotiazida: 'hidroclorotiazida',
  salbutamol: 'salbutamol',
  budesonida: 'budesonida',
  ambroxol: 'ambroxol',
  carbocisteina: 'carbocisteina',
  acetaminofen: 'acetaminofen',
  acetaminofen: 'paracetamol',
  aspirin: 'aspirina',
  aspirina: 'aspirina',
  alcanfor: 'alcanfor',
  acido_folico: 'acido folico',
  complejo_b: 'complejo b',
  penicilina: 'penicilina',
  gentamicina: 'gentamicina',
  betametasona: 'betametasona',
  clotrimazol: 'clotrimazol',
  miconazol: 'miconazol',
  nistatina: 'nistatina',
  clotrimazol: 'clotrimazol',
  ketoconazol: 'ketoconazol',
  ibuprufeno: 'ibuprofeno',
};

function correctTypos(text: string): string {
  const words = normalize(text).split(' ');
  return words.map((w) => TYPO_MAP[w] || w).join(' ');
}

// ─── Sinónimos ampliados para búsqueda inteligente ────────────────────────────
const SYMPTOM_SYNONYMS: Record<string, string[]> = {
  gripe: ['gripe', 'gripa', 'resfriado', 'resfrio', 'catarro', 'congestion', 'congestión', 'nasal', 'fiebre', 'tos', 'mucosidad'],
  fiebre: ['fiebre', 'fievre', 'temperatura', 'calentura', 'febri', 'antipiretico', 'antipirético', 'gripe', 'infeccion'],
  dolor: ['dolor', 'dolores', 'analgesico', 'analgésico', 'pain', 'molestia', 'cabeza', 'migraña', 'espalda', 'musculo'],
  cabeza: ['cabeza', 'cefalea', 'migraña', 'migra', 'headache', 'dolor', 'tension'],
  tos: ['tos', 'toce', 'jarabe', 'expectorante', 'antitusivo', 'bromhexina', 'ambroxol', 'respiratorio', 'bronquitis'],
  estomago: ['estomago', 'estómago', 'gastritis', 'acidez', 'reflujo', 'colitis', 'diarrea', 'diarea', 'nausa', 'náusea', 'vomito', 'vómito', 'estrenimiento', 'laxante'],
  alergia: ['alergia', 'alerjia', 'alergico', 'histamina', 'loratadina', 'cetirizina', 'rinitis', 'conjuntivitis', 'estornudo', 'picazon'],
  diabetes: ['diabetes', 'diabetis', 'glucosa', 'azucar', 'metformina', 'glibenclamida', 'insulina'],
  presion: ['presion', 'presión', 'hipertension', 'hipertensión', 'tension', 'cardio', 'enalapril', 'losartan', 'amlodipino', 'atenolol'],
  infeccion: ['infeccion', 'infección', 'bacteria', 'antibiotico', 'antibiótico', 'amoxicilina', 'azitromicina', 'ciprofloxacino', 'garganta', 'oido', 'urinaria'],
  piel: ['piel', 'dermatitis', 'crema', 'unguento', 'clotrimazol', 'fluconazol', 'hongos', 'erupcion', 'comezon'],
  ojo: ['ojo', 'oftalmico', 'colirio', 'lagrima', 'conjuntivitis', 'irritacion', 'vision'],
  hueso: ['hueso', 'huesos', 'calcio', 'vitamina d', 'artrosis', 'artritis', 'osteoporosis', 'rodilla', 'dolor articular'],
  sueno: ['sueno', 'sueño', 'insomnio', 'dormir', 'melatonina', 'relajante', 'ansiedad'],
  estres: ['estres', 'estrés', 'ansiedad', 'nervios', 'depresion', 'depresión', 'tranquilizante', 'relajante'],
  colesterol: ['colesterol', 'trigliceridos', 'lipidos', 'atorvastatina', 'simvastatina', 'grasa', 'sangre'],
  asma: ['asma', 'alergia', 'respiratorio', 'bronquitis', 'salbutamol', 'budesonida', 'dificultad respirar', 'inhalador'],
  herida: ['herida', 'cicatriz', 'infeccion', 'antiseptico', 'yodo', 'peroxido', 'cura', 'gasa'],
};

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>();
  keywords.forEach((kw) => {
    expanded.add(kw);
    Object.entries(SYMPTOM_SYNONYMS).forEach(([key, syns]) => {
      if (kw === key || syns.includes(kw)) {
        expanded.add(key);
        syns.forEach((s) => expanded.add(s));
      }
    });
  });
  return Array.from(expanded);
}

// ─── Extracción de palabras clave ─────────────────────────────────────────────
const STOP_WORDS = new Set([
  'que', 'hay', 'para', 'tienes', 'tiene', 'tengo', 'me', 'un', 'una', 'el', 'la',
  'los', 'las', 'de', 'del', 'en', 'con', 'por', 'y', 'o', 'a', 'al', 'se', 'es',
  'son', 'como', 'si', 'no', 'mi', 'tu', 'su', 'algo', 'algun', 'alguna', 'alguno',
  'quiero', 'necesito', 'busco', 'dame', 'dime', 'puedes', 'puede', 'favor', 'porfavor',
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'ok', 'bien',
  'disponible', 'disponibles', 'stock', 'inventario', 'medicamento', 'medicina',
  'producto', 'productos', 'farmacia', 'tienda', 'tenemos', 'tienen', 'sabes',
  'conoces', 'existe', 'tambien', 'ademas', 'otro', 'otra', 'mas', 'menos', 'eso',
  'este', 'esta', 'eso', 'aqui', 'alli', 'donde', 'cuando', 'porque', 'entonces',
]);

function extractKeywords(text: string): string[] {
  const corrected = correctTypos(text);
  const base = corrected
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return expandKeywords(base);
}

// ─── Detección de intención ───────────────────────────────────────────────────
type Intent =
  | 'buscar_producto'
  | 'consultar_stock'
  | 'ver_vencimientos'
  | 'saludo'
  | 'ayuda'
  | 'precio'
  | 'desconocido';

function detectIntent(text: string): Intent {
  const n = normalize(text);
  if (/^(hola|buenas|buenos|buen dia|buen tarde|buen noche|hey|saludos|que tal|como estas)/.test(n)) return 'saludo';
  if (/ayuda|como funciona|que puedes|que haces|instrucciones|info|ayudame/.test(n)) return 'ayuda';
  if (/venc|caducar|caducado|expirar|expirado|fecha|vence/.test(n)) return 'ver_vencimientos';
  if (/stock|inventario|cuanto hay|cuantos hay|cuanto tiene|cuantos tiene|disponible|queda/.test(n)) return 'consultar_stock';
  if (/precio|cuanto cuesta|cuanto vale|costo/.test(n)) return 'precio';
  return 'buscar_producto';
}

// ─── Generador de respuesta natural ──────────────────────────────────────────
interface ProductResult {
  nombre: string;
  nombre_generico: string | null;
  descripcion: string | null;
  presentacion: string | null;
  precio: string;
  stock: number;
  fecha_vencimiento: string | null;
  dias_para_vencer: number | null;
  laboratorio: string | null;
  codigo_barra: string | null;
}

function buildResponse(
  intent: Intent,
  keywords: string[],
  products: ProductResult[],
  similarProducts: ProductResult[],
  rol: string,
  originalMessage: string
): string {
  // Saludos
  if (intent === 'saludo') {
    return `¡Hola! Soy el asistente de Farmacia Genosan. Puedo ayudarte a:

• Buscar medicamentos por nombre, síntoma o laboratorio
• Consultar stock disponible en tiempo real
• Ver productos próximos a vencer
• Informarte precios y presentaciones

¿En qué te puedo ayudar hoy?`;
  }

  // Ayuda
  if (intent === 'ayuda') {
    return `Puedo responder preguntas como:

• "¿Qué tienes para la fiebre?"
• "¿Tienes paracetamol?"
• "¿Qué hay en stock?"
• "¿Cuánto cuesta el ibuprofeno?"
• "¿Qué productos vencen pronto?"

Busco en el inventario completo — incluso si escribes con faltas de ortografía — y te muestro solo productos con stock disponible.`;
  }

  // Sin productos encontrados
  if (products.length === 0) {
    let response = `No tengo productos disponibles para "${originalMessage}" en este momento.`;

    if (similarProducts.length > 0) {
      response += `\n\n🔎 ¿Quizás buscabas algo similar?\n`;
      similarProducts.slice(0, 5).forEach((p, i) => {
        const desc = p.descripcion ? ` — ${p.descripcion.slice(0, 60)}${p.descripcion.length > 60 ? '...' : ''}` : '';
        response += `\n${i + 1}. **${p.nombre}**${desc}`;
        if (rol !== 'cliente') response += ` (Stock: ${p.stock})`;
      });
    } else {
      response += `\n\n💡 Intenta con otros términos como:`;
      if (keywords.some((k) => ['gripe', 'fiebre', 'tos'].includes(k))) {
        response += ` "resfriado", "congestión", "jarabe"`;
      } else if (keywords.some((k) => ['dolor', 'cabeza', 'migraña'].includes(k))) {
        response += ` "cabeza", "migraña", "analgesico"`;
      } else if (keywords.some((k) => ['estomago', 'gastritis', 'diarrea'].includes(k))) {
        response += ` "gastritis", "acidez", "reflujo"`;
      } else {
        response += ` el nombre comercial, nombre genérico o síntoma`;
      }
    }
    return response + `\n\n_Consulte con un médico antes de consumir medicamentos._`;
  }

  // Vencimientos (solo admin)
  if (intent === 'ver_vencimientos') {
    if (rol !== 'admin') {
      return 'No tienes permisos para ver información de vencimientos. Consulta con el administrador.';
    }
    const expiring = products
      .filter((p) => p.dias_para_vencer !== null && p.dias_para_vencer <= 60)
      .sort((a, b) => (a.dias_para_vencer ?? 999) - (b.dias_para_vencer ?? 999));

    if (expiring.length === 0) {
      return '✅ No hay productos próximos a vencer en los próximos 60 días.';
    }

    const lines = expiring.map((p) => {
      const urgency = (p.dias_para_vencer ?? 0) <= 15 ? '🔴' : (p.dias_para_vencer ?? 0) <= 30 ? '🟡' : '🟢';
      return `${urgency} **${p.nombre}** — Vence en ${p.dias_para_vencer} días (Stock: ${p.stock})`;
    });

    return `⚠️ Productos próximos a vencer:\n\n${lines.join('\n')}\n\nSe recomienda priorizar la venta de estos productos.`;
  }

  // Consulta de stock general
  if (intent === 'consultar_stock' && keywords.length === 0) {
    const total = products.length;
    const lowStock = products.filter((p) => p.stock <= 5).length;
    const lines = products.slice(0, 10).map((p) => {
      const badge = p.stock <= 5 ? '🔴' : p.stock <= 15 ? '🟡' : '🟢';
      if (rol === 'cliente') return `${badge} **${p.nombre}** — Disponible`;
      return `${badge} **${p.nombre}** — Stock: ${p.stock} unidades`;
    });

    let response = `📦 Inventario actual (${total} productos con stock):\n\n${lines.join('\n')}`;
    if (total > 10) response += `\n\n...y ${total - 10} productos más.`;
    if (lowStock > 0 && rol === 'admin') response += `\n\n⚠️ ${lowStock} producto(s) con stock bajo (≤5 unidades).`;
    return response;
  }

  // Precio específico
  if (intent === 'precio') {
    const lines = products.map((p, i) => {
      const num = i + 1;
      const presentacion = p.presentacion ? ` (${p.presentacion})` : '';
      return `${num}. **${p.nombre}**${presentacion}\n   💰 ${p.precio}${rol !== 'cliente' ? ` · Stock: ${p.stock}` : ''}`;
    });
    return `💰 Precios encontrados para "${keywords.join(' ')}"${products.length === 1 ? '' : ` (${products.length} productos)`}:\n\n${lines.join('\n\n')}`;
  }

  // Búsqueda de productos por síntoma/nombre
  const intro = keywords.length > 0
    ? `Tengo estos productos disponibles para "${keywords.join(' ')}"`
    : 'Tengo estos productos disponibles';

  const lines = products.map((p, i) => {
    const num = i + 1;
    const generico = p.nombre_generico ? ` (${p.nombre_generico})` : '';
    const desc = p.descripcion ? `\n   📝 ${p.descripcion.slice(0, 120)}${p.descripcion.length > 120 ? '...' : ''}` : '';
    const presentacion = p.presentacion ? `\n   💊 ${p.presentacion}` : '';
    const lab = p.laboratorio ? `\n   🏭 Lab: ${p.laboratorio}` : '';

    if (rol === 'cliente') {
      return `${num}. **${p.nombre}**${generico}${presentacion}${lab}${desc}`;
    }

    const precio = `\n   💰 ${p.precio}`;
    const stock = `\n   📦 Stock: ${p.stock} unidades`;
    return `${num}. **${p.nombre}**${generico}${presentacion}${lab}${desc}${precio}${stock}`;
  });

  let response = `${intro}:\n\n${lines.join('\n\n')}`;

  if (similarProducts.length > 0 && similarProducts.length <= 3) {
    response += `\n\n💡 También podría interesarte:`;
    similarProducts.slice(0, 3).forEach((p, i) => {
      const desc = p.descripcion ? ` — ${p.descripcion.slice(0, 50)}...` : '';
      response += `\n• **${p.nombre}**${desc}`;
    });
  }

  return response + `\n\n---\n_Consulte con un médico antes de consumir medicamentos._`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, branchId, userRole } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Mensaje requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rol: string = ['admin', 'empleado', 'cliente'].includes(userRole) ? userRole : 'cliente';

    // Conectar a Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];
    const intent = detectIntent(message);
    const keywords = extractKeywords(message);

    // ── 1. Cargar TODOS los productos activos con descripción ──────────────────
    const { data: allProducts, error: productsError } = await supabase
      .from('products')
      .select('id, commercial_name, generic_name, descripcion, presentation, price, expiry_date, is_active, lab, barcode')
      .eq('is_active', true)
      .order('commercial_name');

    if (productsError) {
      console.error('Supabase error:', productsError);
      return new Response(JSON.stringify({ error: 'Error al consultar la base de datos' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Obtener stock ────────────────────────────────────────────────────────
    let stockQuery = supabase
      .from('stock_farmacia')
      .select('producto_id, cantidad');

    if (branchId) {
      stockQuery = stockQuery.eq('sucursal_id', branchId);
    }

    const { data: stocks } = await stockQuery;

    // Mapa de stock por producto
    const stockMap: Record<string, number> = {};
    (stocks || []).forEach((s: { producto_id: string; cantidad: number }) => {
      const pid = s.producto_id;
      stockMap[pid] = (stockMap[pid] || 0) + (Number(s.cantidad) || 0);
    });

    // ── Helper: construir ProductResult ─────────────────────────────────────
    const buildResult = (p: Record<string, unknown>): ProductResult => {
      const expiry = (p.expiry_date as string) || null;
      const daysToExpiry = expiry
        ? Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        nombre: p.commercial_name as string,
        nombre_generico: (p.generic_name as string) || null,
        descripcion: (p.descripcion as string) || null,
        presentacion: (p.presentation as string) || null,
        precio: `RD$ ${Number(p.price || 0).toFixed(2)}`,
        stock: stockMap[p.id as string] || 0,
        fecha_vencimiento: expiry,
        dias_para_vencer: daysToExpiry,
        laboratorio: (p.lab as string) || null,
        codigo_barra: (p.barcode as string) || null,
      };
    };

    // ── 2. Búsqueda inteligente con descripciones ────────────────────────────
    let exactMatches: ProductResult[] = [];
    let similarMatches: ProductResult[] = [];

    if (intent !== 'ver_vencimientos' && intent !== 'consultar_stock') {
      const sourceProducts = (allProducts || []) as Record<string, unknown>[];

      // Exact + ILIKE search on name, generic name, description
      if (keywords.length > 0) {
        exactMatches = sourceProducts
          .filter((p) => {
            const fields = [
              p.commercial_name as string,
              p.generic_name as string,
              p.descripcion as string,
              p.presentation as string,
              p.lab as string,
            ].filter(Boolean);
            return keywords.some((kw) =>
              fields.some((f) => fuzzyMatch(kw, f, 0.3))
            );
          })
          .map(buildResult);
      }

      // Similar search (broader) when few results
      if (exactMatches.length < 3 && keywords.length > 0) {
        similarMatches = sourceProducts
          .filter((p) => {
            if (exactMatches.some((em) => em.nombre === p.commercial_name)) return false;
            const fields = [
              p.commercial_name as string,
              p.generic_name as string,
              p.descripcion as string,
              p.presentation as string,
            ].filter(Boolean);
            return keywords.some((kw) =>
              fields.some((f) => fuzzyMatch(kw, f, 0.55))
            );
          })
          .map(buildResult);
      }
    }

    // ── 3. Si no hay keywords (stock general / vencimientos) ─────────────────
    let allResults: ProductResult[] = [];
    if (intent === 'ver_vencimientos' || intent === 'consultar_stock') {
      allResults = (allProducts || []).map(buildResult);
    }

    const filtered = (exactMatches.length > 0 ? exactMatches : allResults)
      .filter((p) => {
        if (intent === 'ver_vencimientos') return true;
        return p.stock > 0 && (!p.fecha_vencimiento || p.fecha_vencimiento >= today);
      })
      .slice(0, 15);

    const similar = similarMatches
      .filter((p) => p.stock > 0 && (!p.fecha_vencimiento || p.fecha_vencimiento >= today))
      .slice(0, 5);

    // ── Generar respuesta ────────────────────────────────────────────────────
    const reply = buildResponse(intent, keywords, filtered, similar, rol, message);

    return new Response(
      JSON.stringify({
        reply,
        productsCount: filtered.length,
        similarCount: similar.length,
        intent,
        keywords,
        rol,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
