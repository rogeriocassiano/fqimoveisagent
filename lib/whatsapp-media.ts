import { adminDb } from "./supabase";
import { searchProperties } from "./properties";

export type MediaItem = { type: "image" | "document"; url: string; caption?: string; fileName?: string; mimetype?: string };

export type PropertyPayload = { photos?: string[]; description?: string; unit_features?: string; building_features?: string };

export type Property = {
  reference: string;
  title?: string | null;
  type?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parking_spaces?: number | null;
  area?: number | null;
  sale_price?: number | null;
  url?: string | null;
  payload?: PropertyPayload | null;
};

const MEDIA_WORDS = /\b(fotos?|fotinhas?|imagens?|imgs?|pdf|arquivos?|materia(?:l|is)|flyers?|folders?|plantas?|prospectos?)\b/i;
const PROPERTY_DELIVERY_REQUEST = /\b(manda|mandar|envia|enviar|mostra|mostrar|passa|compartilha)\b/i;
const PROPERTY_WITH_REQUEST = /\b(quero|preciso)\b[^?!.]{0,80}\b(im[óo]ve(?:l|is)|apartamentos?|aptos?|empreendimentos?)\b/i;

export function detectMediaIntent(text: string): boolean {
  return MEDIA_WORDS.test(text) || PROPERTY_DELIVERY_REQUEST.test(text) || PROPERTY_WITH_REQUEST.test(text);
}

const AVAILABILITY_WORDS = /\b(tem|temos)\b[^?!.]{0,40}\b(no|na|nos|nas|em|pro|pra|dispon[ií]vel)\b/i;
const AVAILABILITY_LIST_WORDS = /\b(existe|existem|quais|op[çc][õo]es?|dispon[ií]ve(?:l|is)|disponive(?:l|is)|estoque|cat[áa]logo)\b/i;
const PROPERTY_HINT_WORDS = /\b(apartament|im[óo]vel|imoveis|apto|cobertura|casas|lan[çc]amento)/i;

/** "tem apartamento no caiçara?", "quais as opções no betânia?" */
export function detectAvailabilityIntent(text: string): boolean {
  return PROPERTY_HINT_WORDS.test(text) && (AVAILABILITY_WORDS.test(text) || AVAILABILITY_LIST_WORDS.test(text));
}

/** "você consegue mandar fotos?", "pode enviar o pdf?" */
export function isCapabilityQuestion(text: string): boolean {
  return /\b(consegue|consegues|pode|podes|sabe|capaz|faz)\b/i.test(text);
}

const REF_PATTERNS = [/\bref(?:er[êe]ncia)?[\s\.:]*#?(\d+)\b/i, /\bc[óo]digo[\s\.:]*#?(\d+)\b/i, /\b#(\d+)\b/];

const FILLER_WORDS = new Set(
  [
    "manda", "mandar", "envia", "enviar", "quero", "queria", "pode", "poderia", "consegue", "favor",
    "por", "pfv", "pls", "sobre", "fotos", "foto", "fotinhas", "fotinha", "imagens", "imagem", "imgs", "img", "pdf",
    "arquivo", "arquivos", "material", "materiais", "flyer", "flyers", "planta", "plantas", "prospecto", "prospectos",
    "apartamento", "apartamentos", "imóvel", "imovel", "imóveis", "imoveis", "casa", "casas", "apt", "apê", "ape",
    "do", "da", "de", "dos", "das", "um", "uma", "uns", "umas", "os", "as", "me", "pra", "para", "com", "no", "na",
    "que", "qual", "quais", "esse", "essa", "este", "esta", "aí", "ai", "lá", "la", "mim", "vocês", "voce", "você",
    "regiao", "região", "zona", "bairro", "area", "área", "tudo", "todos", "todas", "ver", "mostra", "mostre",
    "mostrar", "lista", "listar", "disponivel", "disponiveis", "disponível", "disponíveis", "gostaria",
    "tem", "temos", "algum", "alguma", "alguns", "algumas", "opcao", "opções", "opcoes", "vocês", "voces",
    "residencial", "condominio", "condomínio", "edificio", "edifício", "torre", "lancamento", "lançamento",
  ].map(normalizeWord),
);

type SearchFn = (filters: { reference?: string; q?: string }, limit?: number) => Promise<Property[]>;

export type MediaResolution =
  | { kind: "single"; property: Property }
  | { kind: "ambiguous"; properties: Property[] }
  | { kind: "none" };

function candidateWords(text: string): string[] {
  const words = normalizeWord(text.replace(MEDIA_WORDS, " ").replace(/@\d+/g, " "))
    .split(/\W+/)
    .filter((w) => w.length >= 2 && !FILLER_WORDS.has(w));
  return [...new Set(words)].slice(0, 3);
}

export function searchWordsFor(text: string): string[] {
  return candidateWords(text);
}

const GENERIC_TITLE_WORDS = new Set(["residencial", "condominio", "apartamento", "edificio", "torre"]);

function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

/**
 * 3 = token idêntico, 2 = substring/prefixo (mín. 4 letras), 1 = fuzzy (dist. edição).
 * Direcional: "caicaras" casa "caicara", mas tokens curtos como "a" nunca casam.
 */
function tokenSimilarity(query: string, token: string): number {
  if (query.length < 2 || token.length < 2) return 0;
  if (token === query) return 3;
  if (query.length < 4) return 0; // palavras de 2-3 letras: só exato (evita "be" casar "belém")
  if (token.length < 4) return 0;
  if (token.startsWith(query) || query.startsWith(token) || token.includes(query)) return 2;
  const maxDist = query.length >= 6 ? 2 : 1;
  return editDistance(query, token) <= maxDist ? 1 : 0;
}

/** Exato ou substring apenas — usado em endereço/bairro/descrição (sem fuzzy). */
function looseTokenMatch(query: string, token: string): boolean {
  if (query.length < 4 || token.length < 4) return token === query;
  return token === query || token.startsWith(query) || token.includes(query) || query.startsWith(token);
}

/**
 * Pontua um candidato contra as palavras da busca.
 * Título aceita fuzzy; campos secundários só exato/substring; descrição só substring.
 */
function matchScore(
  words: string[],
  title: string,
  secondary = "",
  description = "",
): { score: number; hits: number } {
  const normalizedTitle = normalizeWord(title);
  const titleTokens = normalizedTitle.split(/\W+/).filter(Boolean);
  const secondaryTokens = normalizeWord(secondary).split(/\W+/).filter(Boolean);
  const normalizedDesc = normalizeWord(description);
  let hits = 0;
  let score = 0;
  for (const word of words) {
    const titleLevel = Math.max(0, ...titleTokens.map((token) => tokenSimilarity(word, token)));
    if (titleLevel === 3) score += 20;
    else if (titleLevel === 2) score += 16;
    else if (titleLevel === 1) score += 10;
    else if (secondaryTokens.some((token) => looseTokenMatch(word, token))) score += 5;
    else if (word.length >= 4 && normalizedDesc.includes(word)) score += 3;
    else continue;
    hits++;
  }
  const phrase = words.join(" ");
  if (phrase && normalizedTitle.includes(phrase)) score += 100;
  if (hits === words.length && words.length) score += 50;
  return { score, hits };
}

export function propertySearchWords(p: Property): string[] {
  const all = normalizeWord(`${p.title ?? ""} ${p.neighborhood ?? ""}`)
    .split(/\W+/)
    .filter((w) => w.length >= 2 && !GENERIC_TITLE_WORDS.has(w));
  const distinctive = all.filter((w) => w.length >= 4);
  const words = distinctive.length ? distinctive : all; // nomes curtos ("Be Up") usam tokens de 2-3 letras
  return [...new Set(words)].slice(0, 4);
}

export type ExistingDocument = { id: string; title: string; path: string };

function isSendableDocumentUri(uri: string): boolean {
  return uri.startsWith("http") || uri.toLowerCase().endsWith(".pdf");
}

export async function findExistingPdfDocuments(words: string[], agentId?: string | null): Promise<ExistingDocument[]> {
  const wordsLower = [...new Set(words.map(normalizeWord).filter(Boolean))].slice(0, 4);
  if (!wordsLower.length) return [];

  const db = adminDb();
  // catálogo de documentos é pequeno (centenas) — carrega tudo e pontua em memória.
  // Filtro ilike com limite trunca resultados quando a palavra é comum ("be", "sol").
  const { data, error } = await db
    .from("sources")
    .select("id, title, uri, agent_id")
    .eq("type", "document")
    .limit(5000);
  if (error) return [];
  const docs = (data as { id: string; title: string | null; uri: string | null; agent_id: string | null }[] | null) ?? [];

  // frequência de cada palavra nos títulos — palavras raras valem mais (IDF)
  const wordDf = new Map<string, number>();
  for (const word of wordsLower) {
    let df = 0;
    for (const d of docs) {
      const tokens = normalizeWord(d.title ?? "").split(/\W+/).filter(Boolean);
      if (tokens.some((token) => tokenSimilarity(word, token) > 0)) df++;
    }
    wordDf.set(word, df || 1);
  }

  const scored = docs
    .filter((d) => typeof d.uri === "string" && isSendableDocumentUri(d.uri))
    .map((d) => {
      const title = normalizeWord(d.title ?? "");
      const titleTokens = title.split(/\W+/).filter(Boolean);
      let hits = 0;
      let score = 0;
      for (const word of wordsLower) {
        const level = Math.max(0, ...titleTokens.map((token) => tokenSimilarity(word, token)));
        if (!level) continue;
        hits++;
        score += (level === 3 ? 20 : level === 2 ? 14 : 8) * Math.log2(1 + docs.length / (wordDf.get(word) ?? 1));
      }
      if (hits === wordsLower.length && wordsLower.length) score += 50;
      const flyerBoost = /folder|flyer|book|apresenta|marketing/.test(title) ? 15 : 0;
      const auxiliaryPenalty = /tabela|mapa|planta|memorial|convencao/.test(title) ? 10 : 0;
      return { doc: d, hits, score: score + flyerBoost - auxiliaryPenalty };
    })
    .filter((entry) => entry.hits > 0 && entry.score > 0);

  // passe estrito (todas as palavras); se vazio, aceita os docs com maior cobertura parcial
  let matching = scored.filter((entry) => entry.hits === wordsLower.length);
  if (!matching.length && scored.length) {
    const bestHits = Math.max(...scored.map((entry) => entry.hits));
    const relaxed = scored.filter((entry) => entry.hits === bestHits);
    const topScore = Math.max(...relaxed.map((entry) => entry.score));
    matching = relaxed.filter((entry) => entry.score >= topScore * 0.7);
  }
  if (!matching.length) return [];

  const ranked = matching.sort((a, b) => b.score - a.score || a.doc.title?.localeCompare(b.doc.title ?? "") || 0);

  if (agentId) {
    const own = ranked.filter((entry) => entry.doc.agent_id === agentId);
    if (own.length) return own.slice(0, 3).map(toExistingDocument);
  }
  return ranked.slice(0, 3).map(toExistingDocument);
}

function toExistingDocument(entry: { doc: { id: string; title: string | null; uri: string | null } }): ExistingDocument {
  return { id: entry.doc.id, title: entry.doc.title ?? entry.doc.uri ?? "", path: entry.doc.uri! };
}

export async function resolvePropertyForMedia(text: string, search: SearchFn = searchProperties): Promise<MediaResolution> {
  for (const pattern of REF_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const found = await search({ reference: match[1] }, 1);
      if (found?.length) return { kind: "single", property: found[0] };
      return { kind: "none" };
    }
  }

  const words = candidateWords(text);
  if (!words.length) return { kind: "none" };

  let candidates: Property[] = [];
  try {
    if (search === searchProperties) {
      candidates = ((await search({}, 1000)) ?? []) as Property[];
    } else {
      const found = new Map<string, Property>();
      for (const word of words) {
        for (const property of (await search({ q: word }, 20)) ?? []) found.set(property.reference, property);
      }
      candidates = [...found.values()];
    }
  } catch {
    return { kind: "none" };
  }

  const ranked = candidates
    .map((property) => {
      const secondary = `${property.neighborhood ?? ""} ${property.city ?? ""} ${property.address ?? ""}`;
      return { property, ...matchScore(words, property.title ?? "", secondary, property.payload?.description ?? "") };
    })
    .filter((entry) => entry.hits === words.length && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.property.reference.localeCompare(b.property.reference));

  if (!ranked.length) return { kind: "none" };
  const bestScore = ranked[0].score;
  const best = ranked.filter((entry) => entry.score === bestScore).map((entry) => entry.property);
  if (best.length === 1) return { kind: "single", property: best[0] };
  return { kind: "ambiguous", properties: best.slice(0, 5) };
}

export function propertyCaption(p: Property): string {
  const price = p.sale_price ? `R$ ${p.sale_price.toLocaleString("pt-BR")}` : "Consulte";
  return `Ref ${p.reference} • ${price}${p.neighborhood ? ` • ${p.neighborhood}` : ""}${p.url ? `\n${p.url}` : ""}`;
}

/** Regiões administrativas de BH -> bairros (expande "tem apto na região do barreiro?"). */
const BH_REGIONS: Record<string, string[]> = {
  barreiro: ["barreiro", "milionarios", "jardim das mansoes", "tirol", "petropolis", "diamante", "cardoso", "teixeira dias", "vale do jatoba"],
  "centro sul": ["centro", "savassi", "lourdes", "funcionarios", "sion", "santo antonio", "cruzeiro", "carmo", "luxemburgo", "mangabeiras", "belvedere", "santa efigenia"],
  pampulha: ["pampulha", "ouro preto", "santa rosa", "castelo", "sao luis", "jaragua", "dona clara", "manacas", "liberdade", "paqueta"],
  oeste: ["betania", "buritis", "estoril", "salgado filho", "nova suissa", "joao pinheiro", "jardim america", "cabana", "gameleira", "nova granada"],
  noroeste: ["caicara", "alto caicaras", "carlos prates", "padre eustaquio", "sao cristovao", "coqueiros", "dom bosco", "gloria", "minas brasil"],
  "venda nova": ["venda nova", "ceu azul", "piratininga", "mantiqueira", "rio branco", "planalto", "serra verde", "jardim leblon"],
  nordeste: ["cidade nova", "uniao", "horto", "floresta", "santa tereza", "esplanada", "sao gabriel", "nazare", "concordia"],
  leste: ["taquaril", "santa cruz", "vera cruz", "saudade", "silveira", "vista alegre", "palmares"],
  norte: ["jaqueline", "tupi", "juliana", "heliopolis", "solimoes", "providencia"],
  sudeste: ["pomar", "embaubas", "serra"],
};

/** Se o texto menciona uma região de BH, devolve os bairros dela (já normalizados). */
export function regionExpansion(text: string): string[] {
  const norm = normalizeWord(text).replace(/\W+/g, " ");
  const expanded = Object.entries(BH_REGIONS)
    .filter(([region]) => norm.includes(region))
    .flatMap(([, hoods]) => hoods);
  return [...new Set(expanded)];
}

/** Busca imóveis disponíveis por palavras (bairro/nome/endereço), tolerante a acentos. */
export async function listPropertyOptions(
  words: string[],
  listAll: () => Promise<Property[]> = async () => (await searchProperties({}, 1000)) as unknown as Property[],
  partialOk = false,
): Promise<Property[]> {
  const wordsLower = [...new Set(words.map(normalizeWord).filter(Boolean))].slice(0, 12);
  if (!wordsLower.length) return [];

  const all = await listAll().catch((err) => {
    console.error("list_property_options_failed", err instanceof Error ? err.message : "unknown");
    return [];
  });
  const scored = (all ?? [])
    .map((p) => {
      const secondary = `${p.neighborhood ?? ""} ${p.city ?? ""} ${p.address ?? ""}`;
      const { score, hits } = matchScore(wordsLower, p.title ?? "", secondary, p.payload?.description ?? "");
      return { property: p, score, hits };
    })
    .filter((entry) => entry.hits > 0);

  const full = scored.filter((entry) => entry.hits === wordsLower.length);
  return (full.length && !partialOk ? full : scored)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .slice(0, 5)
    .map((entry) => entry.property);
}

/** Entre opções pendentes, casa a resposta do corretor com um imóvel. */
export function matchChoice(text: string, options: Property[]): Property[] {
  const words = [...new Set(normalizeWord(text).split(/\W+/).filter((w) => w.length >= 3 && !FILLER_WORDS.has(w)))].slice(0, 4);
  if (!words.length) return [];

  const scored = options
    .map((p) => {
      const secondary = `${p.neighborhood ?? ""} ${p.city ?? ""} ref ${p.reference}`;
      const { score, hits } = matchScore(words, p.title ?? "", secondary);
      return { property: p, score, hits };
    })
    .filter((entry) => entry.hits > 0);

  const full = scored.filter((entry) => entry.hits === words.length);
  return (full.length ? full : scored)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .map((entry) => entry.property);
}

export function describeProperty(p: Property): string {
  const lines = [`${p.title ?? "Imóvel"} (Ref ${p.reference})`];
  const place = [p.neighborhood, p.city].filter(Boolean).join(" - ");
  if (place) lines.push(place);
  if (p.address) lines.push(p.address);
  lines.push(formatPrice(p.sale_price));
  const features = [
    p.bedrooms != null ? `${p.bedrooms} quartos` : null,
    p.suites ? `${p.suites} suítes` : null,
    p.bathrooms != null ? `${p.bathrooms} banheiros` : null,
    p.parking_spaces ? `${p.parking_spaces} vagas` : null,
    p.area ? `${p.area} m²` : null,
  ].filter(Boolean);
  if (features.length) lines.push(features.join(" • "));
  if (p.url) lines.push(`Anúncio: ${p.url}`);
  return lines.join("\n");
}

export function formatPrice(value?: number | null): string {
  return value ? `R$ ${value.toLocaleString("pt-BR")}` : "Consulte";
}
