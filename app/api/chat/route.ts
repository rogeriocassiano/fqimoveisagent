import { z } from "zod";
import { chatWithAgent, chatWithAllAgents } from "@/lib/agent";
import { answerWithGemini } from "@/lib/gemini";
import { extractTextFromFile } from "@/lib/extract";
import { uploadFile } from "@/lib/storage";
import {
  detectAvailabilityIntent,
  detectMediaIntent,
  findExistingPdfDocuments,
  listPropertyOptions,
  propertyCaption,
  resolvePropertyForMedia,
  searchWordsFor,
  type MediaItem,
} from "@/lib/whatsapp-media";

const textSchema = z.object({ message: z.string().trim().min(1).max(4000), agentId: z.string().optional() });

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  try {
    let message = "";
    let agentId = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      message = (form.get("message") as string) || "";
      agentId = (form.get("agentId") as string) || "";
      const f = form.get("file");
      if (f instanceof File) file = f;
    } else {
      const parsed = textSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Mensagem inválida" }, { status: 400 });
      message = parsed.data.message;
      agentId = parsed.data.agentId ?? "";
    }

    if (!message.trim() && !file) return Response.json({ error: "Mensagem ou arquivo necessário" }, { status: 400 });

    let extractedText = "";
    const parts: { inlineData: { mimeType: string; data: string } }[] = [];
    let fileUrl = "";

    if (file) {
      const { publicUrl } = await uploadFile(file, "chat");
      fileUrl = publicUrl;
      if (file.type.startsWith("image/")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const b64 = Buffer.from(bytes).toString("base64");
        parts.push({ inlineData: { mimeType: file.type || "image/png", data: b64 } });
      } else if (
        file.type === "application/pdf" ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.name.endsWith(".pdf") ||
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls") ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".txt")
      ) {
        extractedText = await extractTextFromFile(file);
      }
    }

    const prompt = [message, extractedText && `Conteúdo do arquivo ${file?.name}:\n${extractedText}`].filter(Boolean).join("\n\n") || "Descreva o conteúdo enviado.";

    if (!file && detectMediaIntent(message)) {
      const words = searchWordsFor(message);
      const docs = await findExistingPdfDocuments(words, agentId && agentId !== "all" ? agentId : null);
      const resolution = await resolvePropertyForMedia(message);
      const media: MediaItem[] = docs.map((doc) => ({
        type: "document",
        url: doc.path,
        fileName: `${doc.title.replace(/[^a-zA-Z0-9À-ÿ._ -]/g, "_")}.pdf`,
        mimetype: "application/pdf",
        caption: "Flyer do imóvel",
      }));
      if (resolution.kind === "single") {
        for (const url of resolution.property.payload?.photos?.slice(0, 6) ?? []) {
          media.unshift({ type: "image", url, caption: propertyCaption(resolution.property) });
        }
      }
      if (media.length) {
        const name = resolution.kind === "single" ? resolution.property.title : words.join(" ");
        return Response.json({ answer: `Encontrei o material de ${name || "imóvel"}. Os arquivos estão anexados abaixo.`, sources: [], media, fileUrl });
      }
    }

    if (!file && detectAvailabilityIntent(message)) {
      const options = await listPropertyOptions(searchWordsFor(message));
      if (options.length) {
        const answer = options.map((p) => `Ref ${p.reference} - ${p.title ?? "Imóvel"}${p.address ? ` - ${p.address}` : ""}`).join("\n");
        return Response.json({ answer: `Encontrei ${options.length} opção(ões):\n\n${answer}\n\nPeça o flyer pelo nome ou pela referência.`, sources: [], media: [], fileUrl });
      }
    }

    if (agentId === "all") {
      const result = await chatWithAllAgents(prompt, parts);
      return Response.json({ ...result, fileUrl });
    }

    if (agentId) {
      const result = await chatWithAgent(agentId, prompt, parts);
      return Response.json({ ...result, fileUrl });
    }

    const answer = await answerWithGemini(prompt, "", undefined, parts);
    return Response.json({ answer, sources: [], fileUrl });
  } catch (error) {
    console.error("chat_request_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível responder agora" }, { status: 503 });
  }
}
