import { adminDb } from "@/lib/supabase";
import { chatWithAgent, chatWithAllAgents } from "@/lib/agent";
import { createPropertyFlyerUrl } from "@/lib/flyer";
import { transcribeAudio } from "@/lib/extract";
import { signedDocumentUrl } from "@/lib/storage";
import {
  detectAvailabilityIntent,
  detectMediaIntent,
  describeProperty,
  findExistingPdfDocuments,
  formatPrice,
  isCapabilityQuestion,
  listPropertyOptions,
  matchChoice,
  propertyCaption,
  propertySearchWords,
  resolvePropertyForMedia,
  regionExpansion,
  searchWordsFor,
  type MediaItem,
  type Property,
} from "@/lib/whatsapp-media";
import { searchProperties } from "@/lib/properties";
import { NextRequest, NextResponse } from "next/server";

function authorized(req: NextRequest) {
  const secret = process.env.WA_SERVICE_SECRET;
  return secret && req.headers.get("x-wa-secret") === secret;
}

type PendingChoice = { properties: Property[]; ts: number };
const pendingChoices = new Map<string, PendingChoice>();
const pendingMediaTargets = new Map<string, number>();
const PENDING_TTL_MS = 5 * 60_000;

const CAPABILITY_REPLY =
  "Consigo sim! Me passa o nome do empreendimento ou a ref do imóvel que eu te mando as fotos e o PDF/flyer dele. Também entendo áudio, pode gravar tranquilo.";
const MEDIA_LIKE_QUESTION = /manda[r]?|envia[r]?|compartilha[r]?|passa[r]?/i;

function formatPropertyList(properties: Property[]): string {
  return properties.map((p) => `Ref ${p.reference} - ${p.title ?? "sem título"}`).join("\n");
}

async function existingDocumentsMedia(words: string[], agentId: string | null, caption: string): Promise<MediaItem[]> {
  const docs = await findExistingPdfDocuments(words, agentId);
  const items: MediaItem[] = [];
  for (const doc of docs) {
    try {
      // links externos (ex: Google Drive) já são públicos — só assina caminhos do Supabase
      const url = doc.path.startsWith("http") ? doc.path : await signedDocumentUrl(doc.path);
      items.push({
        type: "document",
        url,
        fileName: `${doc.title.replace(/[^\w\s.-]/g, "").trim() || "documento"}.pdf`,
        mimetype: "application/pdf",
        caption,
      });
    } catch (error) {
      console.error("wa_signed_doc_failed", error instanceof Error ? error.message : "unknown");
    }
  }
  return items;
}

/** Resposta de mídia para um imóvel já identificado: fotos + PDFs (existentes > gerado). */
async function propertyMediaResponse(property: Property, agentId: string | null): Promise<{ reply: string; media?: MediaItem[] }> {
  const photos = property.payload?.photos ?? [];
  const media: MediaItem[] = photos.slice(0, 6).map((url, index) => ({
    type: "image",
    url,
    caption: index === 0 ? propertyCaption(property) : undefined,
  }));

  let documentsMedia = await existingDocumentsMedia(propertySearchWords(property), agentId, "Flyer do imóvel");
  let flyerSent = documentsMedia.length > 0;
  if (!flyerSent) {
    try {
      const flyer = await createPropertyFlyerUrl(property);
      documentsMedia = [{ type: "document", url: flyer.url, fileName: flyer.fileName, mimetype: "application/pdf", caption: "Flyer com todos os dados" }];
      flyerSent = true;
    } catch (error) {
      console.error("wa_flyer_failed", error instanceof Error ? error.message : "unknown");
    }
  }
  media.push(...documentsMedia);

  const attachmentNote = photos.length
    ? flyerSent
      ? documentsMedia.length > 1
        ? `Mandei as fotos e ${documentsMedia.length} PDFs do imóvel em seguida.`
        : "Mandei as fotos e o flyer em seguida."
      : "Mandei as fotos em seguida."
    : flyerSent
      ? "Esse imóvel não tem fotos cadastradas, mas mandei o flyer com os dados."
      : "Não achei fotos nem consegui gerar o flyer desse imóvel.";

  return { reply: `${describeProperty(property)}\n\n${attachmentNote}`, media: media.length ? media : undefined };
}

async function buildMediaResponse(text: string, agentId: string | null, pendingKey: string): Promise<{ reply: string; media?: MediaItem[] }> {
  const resolution = await resolvePropertyForMedia(text);

  if (resolution.kind === "none") {
    const docs = await existingDocumentsMedia(searchWordsFor(text), agentId, "");
    if (docs.length) {
      return { reply: "Mandei os PDFs que encontrei com esse nome. Se quiser de um imóvel específico, me passa a referência (ex: ref 123).", media: docs };
    }
    if (isCapabilityQuestion(text) || MEDIA_LIKE_QUESTION.test(text)) return { reply: CAPABILITY_REPLY };
    return { reply: "Não consegui identificar qual imóvel você procura. Me passa a referência? (ex: ref 123)" };
  }

  if (resolution.kind === "ambiguous") {
    const titles = new Set(resolution.properties.map((p) => (p.title ?? "").toLowerCase().trim()));
    if (titles.size === 1) {
      const docs = await existingDocumentsMedia(searchWordsFor(text), agentId, "Flyer do empreendimento");
      const images = resolution.properties.flatMap((p) =>
        (p.payload?.photos ?? []).slice(0, 2).map((url) => ({ type: "image" as const, url, caption: propertyCaption(p) })),
      );
      const media = [...images, ...docs];
      if (media.length) {
        return {
          reply: `${resolution.properties[0].title} tem ${resolution.properties.length} opções (${resolution.properties.map((p) => `Ref ${p.reference}`).join(", ")}). Mandei as fotos e os PDFs do empreendimento.`,
          media,
        };
      }
    }
    pendingChoices.set(pendingKey, { properties: resolution.properties, ts: Date.now() });
    return { reply: `Achei mais de um imóvel com esse nome:\n${formatPropertyList(resolution.properties)}\nQual deles você quer?` };
  }

  return propertyMediaResponse(resolution.property, agentId);
}

/** "tem apartamento no caiçara?" / "na região do barreiro?" / "me mostra tudo" — lista opções e anexa flyers. */
async function buildAvailabilityResponse(text: string, agentId: string | null, pendingKey: string): Promise<{ reply: string; media?: MediaItem[] }> {
  const words = searchWordsFor(text);
  const regionHoods = regionExpansion(text);
  const isRegional = regionHoods.length > 0;
  const effectiveWords = isRegional ? [...new Set([...words, ...regionHoods])] : words;

  let options = effectiveWords.length ? await listPropertyOptions(effectiveWords, undefined, isRegional) : [];
  let totalCount: number | null = null;
  if (!options.length && !words.length && !isRegional) {
    // pergunta genérica ("quais apartamentos vocês têm?") — amostra do catálogo
    const all = (await searchProperties({}, 1000).catch(() => [])) as unknown as Property[];
    totalCount = all.length;
    options = all.slice(0, 8);
  }

  if (!options.length) {
    return { reply: "Não tenho nada disponível com esse critério agora. Me diz outro bairro ou o nome do empreendimento que eu vejo pra você." };
  }

  const list = options
    .map(
      (p) =>
        `Ref ${p.reference} - ${p.title ?? "Imóvel"} - ${p.address ?? p.neighborhood ?? ""} - ${formatPrice(p.sale_price)}${p.bedrooms != null ? ` (${p.bedrooms} quartos)` : ""}`,
    )
    .join("\n");

  const media: MediaItem[] = [];
  const usedDocs = new Set<string>();
  if (effectiveWords.length) {
    for (const option of options.slice(0, 3)) {
      const docs = await existingDocumentsMedia(propertySearchWords(option), agentId, "Flyer do imóvel");
      const doc = docs.find((d) => !usedDocs.has(d.url));
      if (doc) {
        usedDocs.add(doc.url);
        media.push(doc);
      }
    }
  }

  pendingChoices.set(pendingKey, { properties: options, ts: Date.now() });
  const header =
    totalCount != null
      ? `Temos ${totalCount} imóveis disponíveis no total. Alguns deles:`
      : `Tenho ${options.length} opção(ões) disponível(is):`;
  const note = media.length
    ? `Mandei o flyer de ${media.length} deles em seguida. Quer fotos ou detalhes de algum? Me diz o nome ou a ref.`
    : "Quer fotos, PDF ou detalhes de algum? Me diz o nome, a ref, outro bairro ou região.";

  return { reply: `${header}\n\n${list}\n\n${note}`, media: media.length ? media : undefined };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type || !body.sessionId) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const db = adminDb();

  if (body.type === "status") {
    const update: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.phone) update.phone = body.phone;
    await db.from("wa_sessions").update(update).eq("id", body.sessionId);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "message") {
    const { data: session } = await db
      .from("wa_sessions")
      .select("id, agent_id, status")
      .eq("id", body.sessionId)
      .single();
    if (!session || session.status !== "connected") return NextResponse.json({ reply: null });

    const agentId = (session as { agent_id?: string | null }).agent_id ?? null;
    const contactId = `wa:${body.participant ?? body.from ?? "unknown"}`;
    const pendingKey = `${body.sessionId}:${contactId}`;

    let text = (body.text ?? "").toString().trim();

    if (body.audio) {
      try {
        const mime = (body.audioMimetype ?? "audio/ogg").split(";")[0];
        const file = new File([Buffer.from(body.audio, "base64")], `audio.${mime.includes("wav") ? "wav" : "ogg"}`, { type: mime });
        const transcription = await transcribeAudio(file);
        if (transcription?.trim()) text = `${text} ${transcription}`.trim();
      } catch (error) {
        console.error("wa_transcribe_failed", error instanceof Error ? error.message : "unknown");
      }
      if (!text) return NextResponse.json({ reply: "Não consegui entender esse áudio. Pode mandar por escrito?" });
    }

    if (!text) return NextResponse.json({ reply: null });

    const pendingMediaTs = pendingMediaTargets.get(pendingKey);
    if (pendingMediaTs) {
      pendingMediaTargets.delete(pendingKey);
      if (Date.now() - pendingMediaTs < PENDING_TTL_MS && !detectMediaIntent(text)) {
        return NextResponse.json(await buildMediaResponse(`manda o flyer e as fotos do ${text}`, agentId, pendingKey));
      }
    }

    const pending = pendingChoices.get(pendingKey);
    if (pending) {
      const expired = Date.now() - pending.ts >= PENDING_TTL_MS;
      if (expired) {
        pendingChoices.delete(pendingKey);
      } else {
        const matched = matchChoice(text, pending.properties);
        if (matched.length === 1) {
          pendingChoices.delete(pendingKey);
          return NextResponse.json(await propertyMediaResponse(matched[0], agentId));
        }
        if (matched.length > 1) {
          pendingChoices.set(pendingKey, { properties: matched, ts: Date.now() });
          return NextResponse.json({ reply: `Ainda tenho mais de um candidato:\n${formatPropertyList(matched)}\nQual deles?` });
        }
        pendingChoices.delete(pendingKey);
      }
    }

    if (detectAvailabilityIntent(text)) {
      try {
        return NextResponse.json(await buildAvailabilityResponse(text, agentId, pendingKey));
      } catch (error) {
        console.error("wa_availability_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    if (detectMediaIntent(text)) {
      try {
        const response = await buildMediaResponse(text, agentId, pendingKey);
        if (!response.media?.length) pendingMediaTargets.set(pendingKey, Date.now());
        return NextResponse.json(response);
      } catch (error) {
        console.error("wa_media_flow_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    try {
      // agent_id null = agente geral (contexto de todos os agentes)
      const { answer } = agentId
        ? await chatWithAgent(agentId, text, undefined, contactId)
        : await chatWithAllAgents(text, undefined, contactId);
      return NextResponse.json({ reply: answer });
    } catch (error) {
      console.error("wa_message_reply_failed", error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ reply: null });
    }
  }

  return NextResponse.json({ error: "Tipo desconhecido" }, { status: 400 });
}
