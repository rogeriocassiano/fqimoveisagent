import { adminDb } from "./supabase";
import { embedText } from "./embeddings";
import { answerWithGemini } from "./gemini";
import { extractTextFromFile } from "./extract";
import { uploadFile } from "./storage";
import { searchProperties } from "./properties";
import * as cheerio from "cheerio";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

const URL_REGEX = /https?:\/\/[^\s]+/gi;

async function extractUrlsFromMessage(message: string): Promise<string> {
  const urls = message.match(URL_REGEX);
  if (!urls) return "";
  const results: string[] = [];
  for (const url of urls.slice(0, 3)) {
    try {
      const text = await fetchAndParseUrl(url);
      if (text) results.push(`URL: ${url}\n${text.slice(0, 5000)}`);
    } catch (err) {
      console.warn("fetch_url_failed", url, err instanceof Error ? err.message : "");
    }
  }
  return results.join("\n\n");
}

async function defaultOrganizationId() {
  const db = adminDb();
  const { data: existing } = await db.from("organizations").select("id").limit(1);
  if (existing?.[0]) return existing[0].id as string;
  const { data: created, error } = await db.from("organizations").insert({ name: "FQ Imóveis" }).select("id").single();
  if (error || !created) throw new Error("Falha ao criar organização");
  return created.id as string;
}

export async function createAgent(input: { name: string; persona?: string; tone?: string; system_prompt?: string }) {
  const db = adminDb();
  const organizationId = await defaultOrganizationId();
  const { data, error } = await db
    .from("agents")
    .insert({
      organization_id: organizationId,
      name: input.name,
      persona: input.persona ?? "",
      tone: input.tone ?? "",
      status: "draft",
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Falha ao criar agente");

  if (input.system_prompt?.trim()) {
    await db.from("agent_versions").insert({
      agent_id: data.id,
      version: 1,
      system_prompt: input.system_prompt.trim(),
    });
  }

  return data;
}

export async function listAgents() {
  const { data, error } = await adminDb().from("agents").select("*, agent_versions(version, system_prompt, published_at)").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAgent(id: string) {
  const { data, error } = await adminDb()
    .from("agents")
    .select("*, sources(*), agent_versions(version, system_prompt, published_at)")
    .eq("id", id)
    .single();
  if (error || !data) throw error ?? new Error("Agente não encontrado");
  return data;
}

export async function addSource(
  agentId: string,
  input: { type: "text" | "url" | "audio" | "document"; title: string; content?: string; uri?: string; file?: File }
) {
  const db = adminDb();
  let storagePath: string | undefined;

  if (input.file) {
    const { path } = await uploadFile(input.file);
    storagePath = path;
  }

  const sourceType = input.file ? "document" : input.type;
  const { data: source, error } = await db
    .from("sources")
    .insert({ agent_id: agentId, type: sourceType, title: input.title, uri: storagePath ?? input.uri, status: "pending" })
    .select()
    .single();
  if (error || !source) throw error ?? new Error("Falha ao adicionar fonte");

  if (input.file) {
    const raw = await extractTextFromFile(input.file);
    if (!raw.trim()) throw new Error("Não foi possível extrair texto do arquivo");
    await db.from("documents").insert({ source_id: source.id, raw_content: raw });
  } else if (input.type === "text" && input.content) {
    await db.from("documents").insert({ source_id: source.id, raw_content: input.content });
  }

  return source;
}

export async function fetchAndParseUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "FQ-Imoveis-RAG/1.0" } });
  if (!res.ok) throw new Error(`Falha ao buscar URL: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside").remove();
  const parts: string[] = [];
  $("h1, h2, h3, h4, p, li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) parts.push(text);
  });
  return parts.join("\n\n");
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function trainSource(sourceId: string) {
  const db = adminDb();
  const { data: source, error: sourceError } = await db.from("sources").select("*, documents(*)").eq("id", sourceId).single();
  if (sourceError || !source) throw sourceError ?? new Error("Fonte não encontrada");

  const document = (source as { documents?: { id: string; raw_content?: string }[] }).documents?.[0];
  let raw = "";

  if (source.type === "url" && source.uri) {
    raw = await fetchAndParseUrl(source.uri);
    if (document) {
      const { error: updateError } = await db.from("documents").update({ raw_content: raw }).eq("id", document.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await db.from("documents").insert({ source_id: sourceId, raw_content: raw });
      if (insertError) throw insertError;
    }
  } else if (document?.raw_content) {
    raw = document.raw_content;
  }

  if (!raw.trim()) throw new Error("Conteúdo vazio");

  const chunks = chunkText(raw);
  const dbDoc = document ?? (await db.from("documents").select("id").eq("source_id", sourceId).single()).data;
  if (!dbDoc) throw new Error("Documento não encontrado");
  const documentId = (dbDoc as { id: string }).id;

  // Limpa chunks antigos
  await db.from("chunks").delete().eq("document_id", documentId);

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const values = await embedText(text);
    const { error: chunkError } = await db.from("chunks").insert({
      document_id: documentId,
      text,
      embedding: values,
      token_count: text.length,
      page: i + 1,
      metadata: { source_id: sourceId, chunk_index: i },
    });
    if (chunkError) throw chunkError;
  }

  await db.from("sources").update({ status: "ready" }).eq("id", sourceId);
  return { chunks: chunks.length };
}

async function buildChatContext(message: string, agentId?: string) {
  const db = adminDb();
  const embedding = await embedText(message);
  const rpcArgs: Record<string, unknown> = { query_embedding: embedding, match_threshold: 0.3, match_count: 10 };
  if (agentId) rpcArgs.filter_agent_id = agentId;
  const { data: matches, error: matchError } = await db.rpc("match_chunks", rpcArgs);
  if (matchError) throw matchError;

  const allMatches = (matches as { id: string; document_id: string; text: string; metadata: Record<string, unknown>; similarity: number }[] | null) ?? [];

  const webContext = await extractUrlsFromMessage(message);
  const ragContext = allMatches.map((m) => m.text).join("\n---\n");

  let imoveisContext = "";
  const propertyKeywords = /apartamento|im[óo]vel|imoveis|pre[çc]o|bairro|quarto|vaga|metragem|catal[óo]go|imovel/i;
  const refMatch = message.match(/\bref(?:erencia)?[\s\.:]*#?(\d+)\b/i) ?? message.match(/\b\d{1,5}(?![\d\w])/g)?.map(m => m.trim()).filter(m => Number(m) > 0 && Number(m) < 1000).sort((a, b) => Number(b) - Number(a))[0];
  const isPropertyMessage = propertyKeywords.test(message) || refMatch;
  if (isPropertyMessage) {
    try {
      let imoveis: Awaited<ReturnType<typeof searchProperties>> = [];
      if (typeof refMatch === "string" && !Array.isArray(refMatch)) {
        const found = await searchProperties({ reference: refMatch }, 5);
        imoveis = found && found.length ? found : await searchProperties({}, 20);
      } else {
        imoveis = await searchProperties({}, 20);
      }
      imoveisContext = `Catálogo de imóveis disponíveis:\n${imoveis.map((p: { reference?: string; title?: string; neighborhood?: string; sale_price?: number; bedrooms?: number; bathrooms?: number; parking_spaces?: number; area?: number; url?: string; payload?: { description?: string } }) => `- Ref ${p.reference}: ${p.title}, ${p.neighborhood}, R$ ${p.sale_price?.toLocaleString("pt-BR")}, ${p.bedrooms} quartos, ${p.bathrooms} banh, ${p.parking_spaces} vagas, ${p.area}m². Link: ${p.url}. Descrição: ${p.payload?.description ?? ""}`).join("\n")}`;
    } catch (e) {
      console.warn("property_lookup_failed", e instanceof Error ? e.message : "unknown");
    }
  }

  const context = [ragContext && `Contexto treinado:\n${ragContext}`, webContext && `Conteúdo de sites:\n${webContext}`, imoveisContext].filter(Boolean).join("\n\n");
  return { context, matches: allMatches };
}

export async function chatWithAgent(agentId: string, message: string, parts?: { inlineData: { mimeType: string; data: string } }[], contactId = "chat-user") {
  const db = adminDb();
  const { data: agent, error } = await db.from("agents").select("*, agent_versions(system_prompt)").eq("id", agentId).single();
  if (error || !agent) throw error ?? new Error("Agente não encontrado");

  const systemPrompt = (agent as { agent_versions?: { system_prompt?: string }[] }).agent_versions?.[0]?.system_prompt ?? "";
  const tone = (agent as { tone?: string }).tone ?? "cordial";
  const persona = (agent as { persona?: string }).persona ?? "";

  const { context, matches } = await buildChatContext(message, agentId);

  const prompt = buildFinalPrompt(message, tone, persona, context);
  const answer = await answerWithGemini(message, prompt, systemPrompt, parts);

  const { data: conversation } = await db
    .from("conversations")
    .insert({ agent_id: agentId, channel: "web", contact_id: contactId })
    .select("id")
    .single();
  if (conversation) {
    await db.from("messages").insert([
      { conversation_id: conversation.id, role: "user", text: message },
      { conversation_id: conversation.id, role: "assistant", text: answer },
    ]);
  }

  return { answer, sources: matches };
}

export async function chatWithAllAgents(message: string, parts?: { inlineData: { mimeType: string; data: string } }[], contactId = "chat-user") {
  const db = adminDb();
  const { data: agents } = await db.from("agents").select("*, agent_versions(system_prompt)").order("created_at", { ascending: false });
  const systemPrompts = (agents ?? []).map((a) => (a as { agent_versions?: { system_prompt?: string }[] }).agent_versions?.[0]?.system_prompt ?? "").filter(Boolean).join("\n---\n");
  const tone = "despojado e profissional";
  const persona = "corretor geral da FQ Imóveis, acessa todo o conhecimento treinado de todos os agentes";

  const { context, matches } = await buildChatContext(message);

  const prompt = buildFinalPrompt(message, tone, persona, context);
  const combinedSystemPrompt = `Você é o SR. Queiroz, um assistente geral da FQ Imóveis que combina o conhecimento de todos os agentes treinados.\n\n${systemPrompts}`;
  const answer = await answerWithGemini(message, prompt, combinedSystemPrompt, parts);

  const { data: conversation } = await db
    .from("conversations")
    .insert({ agent_id: null, channel: "web", contact_id: contactId })
    .select("id")
    .single();
  if (conversation) {
    await db.from("messages").insert([
      { conversation_id: conversation.id, role: "user", text: message },
      { conversation_id: conversation.id, role: "assistant", text: answer },
    ]);
  }

  return { answer, sources: matches };
}

function buildFinalPrompt(message: string, tone: string, persona: string, context: string) {
  return `Você é o SR. Queiroz, um assistente de IA jovem, curioso e em constante aprendizado com o diretor de vendas da FQ Imóveis.

Sua voz é HUMANA: curta, espontânea, leve e natural, como um corretor conversando no WhatsApp. Evite textões, introduções forçadas ou parecer um robô. Responda de forma direta, com no máximo 2-3 frases curtas. Se possível, quebre a linha. Use emojis com moderação.

Quando alguém disser "oi", "olá" ou "tudo bem", responda de forma descontraída, como: "Eae, tudo bem?" ou "Salve! Tudo certo por aqui." Não mande textos completos de apresentação nesses casos. Apresente o SR. Queiroz só quando perguntarem quem você é.

Você foi desenvolvido pelo engenheiro de software Rogério Cassiano para a FQ Imóveis. Seu treinamento é feito pelo diretor de vendas e pela gestão da FQ Imóveis.

Seu tom geral é: ${tone || "despojado e profissional"}. Sua persona na empresa é: ${persona || "aprendiz do diretor de vendas"}.

Sempre que possível, use o contexto abaixo. Se a pergunta for sobre um imóvel específico (ref, nome do empreendimento, bairro, preço), use PREFERENCIALMENTE os dados do catálogo de imóveis. Forneça o link, preço e detalhes quando disponíveis. Se a resposta não estiver no contexto, seja honesto, diga que ainda está aprendendo e ofereça encaminhar para um corretor humano.

Contexto:
${context || "Nenhum contexto fornecido."}

Pergunta do usuário: ${message}`;
}
