import { chatWithAgent } from "@/lib/agent";
import { extractTextFromFile } from "@/lib/extract";
import { uploadFile } from "@/lib/storage";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    let message = "";
    let file: File | null = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      message = (form.get("message") as string) || "";
      const f = form.get("file");
      if (f instanceof File) file = f;
    } else {
      const body = await request.json().catch(() => ({}));
      message = typeof body.message === "string" ? body.message : "";
    }

    if (!message.trim() && !file) return Response.json({ error: "Mensagem ou arquivo necessário" }, { status: 400 });

    const parts: { inlineData: { mimeType: string; data: string } }[] = [];
    let extractedText = "";
    let fileUrl = "";

    if (file) {
      const { publicUrl } = await uploadFile(file, "chat");
      fileUrl = publicUrl;
      if (file.type.startsWith("image/")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        parts.push({ inlineData: { mimeType: file.type || "image/png", data: Buffer.from(bytes).toString("base64") } });
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
    const result = await chatWithAgent(id, prompt, parts);
    return Response.json({ ...result, fileUrl });
  } catch (error) {
    console.error("chat_agent_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível conversar com o agente" }, { status: 503 });
  }
}
