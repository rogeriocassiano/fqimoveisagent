import { z } from "zod";
import { chatWithAgent } from "@/lib/agent";
import { answerWithGemini } from "@/lib/gemini";
import { extractTextFromFile } from "@/lib/extract";
import { uploadFile } from "@/lib/storage";

const textSchema = z.object({ message: z.string().trim().min(1).max(4000), agentId: z.string().uuid().optional() });

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
