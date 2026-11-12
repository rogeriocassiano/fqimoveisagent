import { adminDb } from "@/lib/supabase";
import { chatWithAgent, chatWithAllAgents } from "@/lib/agent";
import { createPropertyFlyerUrl } from "@/lib/flyer";
import { transcribeAudio } from "@/lib/extract";
import { synthesizeSpeech } from "@/lib/elevenlabs";
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
  matchDocumentChoice,
  propertyCaption,
  propertySearchWords,
  resolvePropertyForMedia,
  regionExpansion,
  searchWordsFor,
  type MediaItem,
  type Property,
} from "@/lib/whatsapp-media";
import { searchProperties } from "@/lib/properties";
import {
  buildCrmContext,
  confirmMessageFor,
  detectCrmQueryIntent,
  detectStaffIntent,
  executeStaffAction,
  extractStaffAction,
  findStaffByPhone,
  isConfirmation,
  type StaffAction,
  type StaffMember,
} from "@/lib/bitrix";
import { getConvHistory, logCrmAction, rememberTurn } from "@/lib/crm-history";
import { NextRequest, NextResponse } from "next/server";

function authorized(req: NextRequest) {
  const secret = process.env.WA_SERVICE_SECRET;
  return secret && req.headers.get("x-wa-secret") === secret;
}

type PendingChoice = { properties: Property[]; ts: number };
type PendingDocChoice = { docs: { id: string; title: string; path: string }[]; ts: number };
const pendingChoices = new Map<string, PendingChoice>();
const pendingDocChoices = new Map<string, PendingDocChoice>();
const pendingMediaTargets = new Map<string, number>();
const pendingStaffActions = new Map<string, { action: StaffAction; staff: StaffMember; ts: number }>();
const PENDING_TTL_MS = 5 * 60_000;

const CAPABILITY_REPLY =
  "Consigo sim! Me passa o nome do empreendimento ou a ref do imóvel que eu te mando as fotos e o PDF/flyer dele. Também entendo áudio, pode gravar tranquilo.";
const MEDIA_LIKE_QUESTION = /manda[r]?|envia[r]?|compartilha[r]?|passa[r]?/i;

function formatPropertyList(properties: Property[]): string {
  return properties.map((p) => `Ref ${p.reference} - ${p.title ?? "sem título"}`).join("\n");
}

async function docToMediaItem(doc: { title: string; path: string }, caption: string): Promise<MediaItem | null> {
  try {
    // links externos (ex: Google Drive) já são públicos — só assina caminhos do Supabase
    const url = doc.path.startsWith("http") ? doc.path : await signedDocumentUrl(doc.path);
    return {
      type: "document",
      url,
      fileName: `${doc.title.replace(/[^\w\s.-]/g, "").trim() || "documento"}.pdf`,
      mimetype: "application/pdf",
      caption,
    };
  } catch (error) {
    console.error("wa_signed_doc_failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

async function existingDocumentsMedia(words: string[], agentId: string | null, caption: string, limit = 3): Promise<MediaItem[]> {
  const docs = await findExistingPdfDocuments(words, agentId, limit);
  const items = await Promise.all(docs.map((doc) => docToMediaItem(doc, caption)));
  return items.filter((item): item is MediaItem => item !== null);
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
    const foundDocs = await findExistingPdfDocuments(searchWordsFor(text), agentId, 8);
    if (foundDocs.length === 1) {
      const media = await docToMediaItem(foundDocs[0], "");
      return {
        reply: `Não achei esse imóvel no estoque, mas encontrei este material no acervo: ${foundDocs[0].title}. Mandei em seguida.`,
        media: media ? [media] : undefined,
      };
    }
    if (foundDocs.length > 1) {
      // vários materiais podem ser de empreendimentos diferentes ("Exclusive Safira" vs "Residencial Safira") — confirma antes
      pendingDocChoices.set(pendingKey, { docs: foundDocs, ts: Date.now() });
      const list = foundDocs.map((d, i) => `${i + 1}. ${d.title}`).join("\n");
      return { reply: `Não achei esse imóvel no estoque, mas encontrei estes materiais no acervo:\n${list}\n\nQual deles você quer? (manda o número ou o nome — ou "todos")` };
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
      const doc = docs.find((d) => d.url && !usedDocs.has(d.url));
      if (doc?.url) {
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

/** Resposta do webhook. Se a mensagem chegou como nota de voz, devolve também áudio (ElevenLabs). */
async function waRespond(body: { audio?: string | null }, payload: { reply?: string | null; media?: MediaItem[]; [k: string]: unknown }) {
  if (body.audio && payload.reply) {
    try {
      const buf = await synthesizeSpeech(payload.reply);
      if (buf) {
        payload.media = [...(payload.media ?? []), { type: "audio", data: buf.toString("base64"), mimetype: "audio/ogg; codecs=opus", ptt: true }];
      }
    } catch (error) {
      console.error("wa_tts_failed", error instanceof Error ? error.message : "unknown");
    }
  }
  return NextResponse.json(payload);
}

// O agente CRM faz várias chamadas (Gemini tools + Bitrix) — precisa de mais tempo.
export const maxDuration = 60;

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
      .select("id, agent_id, status, organization_id")
      .eq("id", body.sessionId)
      .single();
    if (!session || session.status !== "connected") return waRespond(body, { reply: null });

    let agentId = (session as { agent_id?: string | null }).agent_id ?? null;
    const organizationId = (session as { organization_id?: string }).organization_id ?? null;
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
      if (!text) return waRespond(body, { reply: "Não consegui entender esse áudio. Pode mandar por escrito?" });
    }

    if (!text) return waRespond(body, { reply: null });

    // ── Identifica equipe (número cadastrado no Bitrix) e roteia para o agente interno ──
    let staff: Awaited<ReturnType<typeof findStaffByPhone>> = null;
    try {
      staff = await findStaffByPhone(body.participant ?? body.from ?? "");
    } catch (error) {
      console.error("wa_staff_lookup_failed", error instanceof Error ? error.message : "unknown");
    }

    if (staff && organizationId) {
      // Equipe sempre fala com o agente interno de CRM, independente do agente público da sessão.
      const { data: internal } = await db
        .from("agents")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", "%crm%")
        .limit(1)
        .maybeSingle();
      if (internal?.id) agentId = internal.id;
    }

    // ── Contexto de conversa persistente (equipe): resolve "e o dela?", "essa tarefa" ──
    const convHistory = staff ? await getConvHistory(pendingKey, "wa").catch(() => []) : [];
    const remember = (reply: string | null) => {
      if (!staff) return;
      rememberTurn(pendingKey, "wa", agentId, "user", text);
      if (reply) rememberTurn(pendingKey, "wa", agentId, "model", reply);
    };

    // ── Fluxo de equipe: ações pendentes de confirmação no Bitrix ──
    const pendingStaff = pendingStaffActions.get(pendingKey);
    if (pendingStaff) {
      pendingStaffActions.delete(pendingKey);
      if (Date.now() - pendingStaff.ts < PENDING_TTL_MS) {
        if (isConfirmation(text)) {
          try {
            const reply = await executeStaffAction(pendingStaff.action, pendingStaff.staff);
            remember(reply);
            logCrmAction({
              organizationId, contactKey: pendingKey,
              staffBitrixId: String(pendingStaff.staff.bitrixId), staffName: pendingStaff.staff.name,
              kind: pendingStaff.action.kind, payload: pendingStaff.action,
              result: { reply }, status: "ok",
            });
            return waRespond(body, { reply });
          } catch (error) {
            console.error("wa_b24_action_failed", error instanceof Error ? error.message : "unknown");
            logCrmAction({
              organizationId, contactKey: pendingKey,
              staffBitrixId: String(pendingStaff.staff.bitrixId), staffName: pendingStaff.staff.name,
              kind: pendingStaff.action.kind, payload: pendingStaff.action,
              status: "error",
            });
            return waRespond(body, { reply: "Não consegui gravar no Bitrix agora. Manda de novo que eu tento outra vez." });
          }
        }
        if (!detectStaffIntent(text)) {
          remember("Beleza, cancelei. Precisar de algo é só mandar.");
          logCrmAction({ organizationId, contactKey: pendingKey, staffBitrixId: staff?.bitrixId != null ? String(staff.bitrixId) : undefined, staffName: staff?.name, kind: pendingStaff.action.kind, payload: pendingStaff.action, status: "cancelled" });
          return waRespond(body, { reply: "Beleza, cancelei. Precisar de algo é só mandar." });
        }
      }
    }

    // ── Fluxo de equipe: agendar visita / cadastrar cliente / concluir tarefa ──
    if (detectStaffIntent(text)) {
      try {
        if (staff) {
          const action = await extractStaffAction(text, convHistory);
          if (action) {
            pendingStaffActions.set(pendingKey, { action, staff, ts: Date.now() });
            const reply = await confirmMessageFor(action, staff.name);
            remember(reply);
            return waRespond(body, { reply });
          }
          return waRespond(body, {
            reply:
              "Quase lá — me manda no formato: cliente, dia e hora, e o imóvel (ex: \"agenda visita com a Ana sábado 14h no Neo Pampulha\").",
          });
        }
      } catch (error) {
        console.error("wa_staff_flow_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    const pendingMediaTs = pendingMediaTargets.get(pendingKey);
    if (pendingMediaTs) {
      pendingMediaTargets.delete(pendingKey);
      if (Date.now() - pendingMediaTs < PENDING_TTL_MS && !detectMediaIntent(text)) {
        return waRespond(body, await buildMediaResponse(`manda o flyer e as fotos do ${text}`, agentId, pendingKey));
      }
    }

    const pendingDocs = pendingDocChoices.get(pendingKey);
    if (pendingDocs) {
      pendingDocChoices.delete(pendingKey);
      if (Date.now() - pendingDocs.ts < PENDING_TTL_MS) {
        const chosen = matchDocumentChoice(text, pendingDocs.docs);
        if (chosen.length) {
          const media = (await Promise.all(chosen.map((doc) => docToMediaItem(doc, "")))).filter(
            (item): item is MediaItem => item !== null,
          );
          if (media.length) {
            return waRespond(body, {
              reply: chosen.length === 1 ? `Mandei: ${chosen[0].title}` : `Mandei ${media.length} arquivos.`,
              media,
            });
          }
        }
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
          return waRespond(body, await propertyMediaResponse(matched[0], agentId));
        }
        if (matched.length > 1) {
          pendingChoices.set(pendingKey, { properties: matched, ts: Date.now() });
          return waRespond(body, { reply: `Ainda tenho mais de um candidato:\n${formatPropertyList(matched)}\nQual deles?` });
        }
        // "manda o flyer deles" / "quero as 2 opções" — pedido de material sobre as opções listadas
        if (detectMediaIntent(text)) {
          const seen = new Set<string>();
          const unique = pending.properties.filter((p) => {
            const key = (p.title ?? p.reference).toLowerCase().trim();
            return seen.has(key) ? false : (seen.add(key), true);
          });
          const media: MediaItem[] = [];
          for (const option of unique.slice(0, 3)) {
            const photo = option.payload?.photos?.[0];
            if (photo) media.push({ type: "image", url: photo, caption: propertyCaption(option) });
            media.push(...(await existingDocumentsMedia(propertySearchWords(option), agentId, `Flyer ${option.title ?? ""}`)).slice(0, 2));
          }
          pendingChoices.delete(pendingKey);
          if (media.length) {
            return waRespond(body, {
              reply: `Mandei o material de ${unique.length > 3 ? "3 das" : "todas as"} opções: ${unique.slice(0, 3).map((p) => p.title ?? `Ref ${p.reference}`).join(", ")}.`,
              media,
            });
          }
        }
        pendingChoices.delete(pendingKey);
      }
    }

    // ── Consulta ao CRM: só para números da equipe identificados no Bitrix ──
    // Function calling: o modelo chama a API real do Bitrix conforme a pergunta.
    // Precisa vir ANTES de mídia/disponibilidade: "cliente", "tarefa", "negócio"
    // podem aparecer em frases que casam com intents de imóvel.
    if (staff && detectCrmQueryIntent(text)) {
      try {
        const { answerWithBitrixTools } = await import("@/lib/bitrix-agent");
        const reply = await answerWithBitrixTools(text, staff, convHistory);
        if (reply) {
          remember(reply);
          return waRespond(body, { reply });
        }
      } catch (error) {
        console.error("wa_crm_tools_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    if (detectAvailabilityIntent(text)) {
      try {
        return waRespond(body, await buildAvailabilityResponse(text, agentId, pendingKey));
      } catch (error) {
        console.error("wa_availability_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    if (detectMediaIntent(text)) {
      try {
        const response = await buildMediaResponse(text, agentId, pendingKey);
        if (!response.media?.length) pendingMediaTargets.set(pendingKey, Date.now());
        return waRespond(body, response);
      } catch (error) {
        console.error("wa_media_flow_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    let crmContext: string | undefined;
    if (staff && detectCrmQueryIntent(text)) {
      try {
        crmContext = (await buildCrmContext(text, staff)) ?? undefined;
      } catch (error) {
        console.error("wa_crm_context_failed", error instanceof Error ? error.message : "unknown");
      }
    }

    try {
      // agent_id null = agente geral (contexto de todos os agentes)
      const { answer } = agentId
        ? await chatWithAgent(agentId, text, undefined, contactId, crmContext)
        : await chatWithAllAgents(text, undefined, contactId, crmContext);
      remember(answer);
      return waRespond(body, { reply: answer });
    } catch (error) {
      console.error("wa_message_reply_failed", error instanceof Error ? error.message : "unknown");
      return waRespond(body, { reply: null });
    }
  }

  return NextResponse.json({ error: "Tipo desconhecido" }, { status: 400 });
}
