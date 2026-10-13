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

const MEDIA_WORDS = /\b(fotos?|fotinhas?|imagens?|imgs?|pdf|arquivos?|materia(?:l|is)|flyers?|plantas?|prospectos?)\b/i;

export function detectMediaIntent(text: string): boolean {
  return MEDIA_WORDS.test(text);
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
    .filter((w) => w.length >= 4 && !FILLER_WORDS.has(w));
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

export function propertySearchWords(p: Property): string[] {
  const words = normalizeWord(`${p.title ?? ""} ${p.neighborhood ?? ""}`)
    .split(/\W+/)
    .filter((w) => w.length >= 4 && !GENERIC_TITLE_WORDS.has(w));
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
  // busca no banco por qualquer palavra (título bruto ou título normalizado no metadata)
  const orFilter = wordsLower
    .flatMap((w) => [`title.ilike.%${w}%`, `metadata->>search_title.ilike.%${w}%`])
    .join(",");
  const { data, error } = await db
    .from("sources")
    .select("id, title, uri, agent_id")
    .eq("type", "document")
    .or(orFilter)
    .limit(100);
  if (error) return [];
  const docs = (data as { id: string; title: string | null; uri: string | null; agent_id: string | null }[] | null) ?? [];

  const matching = docs
    .filter((d) => typeof d.uri === "string" && isSendableDocumentUri(d.uri))
    .map((d) => {
      const title = normalizeWord(d.title ?? "");
      const hits = wordsLower.filter((w) => title.includes(w)).length;
      const flyerBoost = /folder|flyer|book|apresenta/.test(title) ? 1 : 0;
      return { doc: d, hits, flyerBoost };
    })
    .filter((entry) => entry.hits > 0);

  // prioriza documentos que casam com TODAS as palavras; no empate, folders/books
  const full = matching.filter((entry) => entry.hits === wordsLower.length);
  const ranked = (full.length ? full : matching).sort(
    (a, b) => b.hits - a.hits || b.flyerBoost - a.flyerBoost,
  );

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
  const wordHits: Property[][] = [];
  for (const word of words) {
    try {
      wordHits.push((await search({ q: word }, 5)) ?? []);
    } catch {
      return { kind: "none" };
    }
  }

  const hits = new Map<string, Property & { hits: number }>();
  for (let i = 0; i < wordHits.length; i++) {
    for (const p of wordHits[i]) {
      const entry = hits.get(p.reference);
      if (entry) {
        entry.hits++;
      } else {
        hits.set(p.reference, { ...p, hits: 1 });
      }
    }
  }

  let matches = [...hits.values()];
  // prioriza imóveis que casam com TODAS as palavras (ex: "Sensia Solarium")
  if (words.length > 1) {
    const full = matches.filter((p) => p.hits === words.length);
    if (full.length) matches = full;
  }

  if (matches.length === 1) return { kind: "single", property: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", properties: matches.slice(0, 3) };
  return { kind: "none" };
}

export function propertyCaption(p: Property): string {
  const price = p.sale_price ? `R$ ${p.sale_price.toLocaleString("pt-BR")}` : "Consulte";
  return `Ref ${p.reference} • ${price}${p.neighborhood ? ` • ${p.neighborhood}` : ""}${p.url ? `\n${p.url}` : ""}`;
}

/** Regiões administrativas de BH -> bairros (expande "tem apto na região do barreiro?"). */
const BH_REGIONS: Record<string, string[]> = {
  barreiro: ["barreiro", "betania", "caicara", "milionarios", "jardim das mansoes", "tirol", "petropolis", "diamante", "cardoso", "teixeira dias", "vale do jatoba"],
  "centro sul": ["centro", "savassi", "lourdes", "funcionarios", "sion", "santo antonio", "cruzeiro", "carmo", "luxemburgo", "coracao eucaristico", "mangabeiras", "belvedere", "santa efigenia"],
  pampulha: ["pampulha", "ouro preto", "santa rosa", "castelo", "sao luis", "jaragua", "dona clara", "manacas", "liberdade", "paqueta"],
  oeste: ["buritis", "estoril", "cabral", "salgado filho", "nova suissa", "joao pinheiro", "jardim america"],
  noroeste: ["carlos prates", "padre eustaquio", "sao cristovao", "coqueiros", "esperanca", "dom joaquim"],
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
      const haystack = normalizeWord(
        `${p.title ?? ""} ${p.neighborhood ?? ""} ${p.city ?? ""} ${p.address ?? ""} ${p.payload?.description ?? ""}`,
      );
      const hits = wordsLower.filter((w) => haystack.includes(w)).length;
      return { property: p, hits };
    })
    .filter((entry) => entry.hits > 0);

  const full = scored.filter((entry) => entry.hits === wordsLower.length);
  return (full.length && !partialOk ? full : scored)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map((entry) => entry.property);
}

/** Entre opções pendentes, casa a resposta do corretor com um imóvel. */
export function matchChoice(text: string, options: Property[]): Property[] {
  const words = [...new Set(normalizeWord(text).split(/\W+/).filter((w) => w.length >= 3 && !FILLER_WORDS.has(w)))].slice(0, 4);
  if (!words.length) return [];

  const scored = options
    .map((p) => {
      const haystack = normalizeWord(`${p.title ?? ""} ${p.neighborhood ?? ""} ref ${p.reference}`);
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { property: p, hits };
    })
    .filter((entry) => entry.hits > 0);

  const full = scored.filter((entry) => entry.hits === words.length);
  return (full.length ? full : scored).sort((a, b) => b.hits - a.hits).map((entry) => entry.property);
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
