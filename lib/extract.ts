import { read, utils } from "xlsx";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "./env";

export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

  if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.endsWith(".xlsx")) {
    const workbook = read(buffer, { type: "buffer" });
    let text = "";
    for (const sheet of workbook.SheetNames) {
      const ws = workbook.Sheets[sheet];
      const json = utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      text += `Planilha ${sheet}:\n${json.map((row) => row.join("\t")).join("\n")}\n\n`;
    }
    return text.trim();
  }

  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    const env = serverEnv();
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        { text: "Extraia todo o texto contido neste PDF em português, mantendo a estrutura e tabelas de forma clara." },
        { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
      ],
    });
    return response.text?.trim() || "";
  }

  if (file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".ogg") || file.name.endsWith(".flac")) {
    return transcribeAudio(file);
  }

  if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv") || file.name.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  if (file.type.startsWith("image/")) {
    const env = serverEnv();
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        { text: "Descreva o conteúdo desta imagem em português. Se houver texto, transcreva-o. Se for um documento, extraia as informações principais." },
        { inlineData: { mimeType: file.type, data: buffer.toString("base64") } },
      ],
    });
    return response.text?.trim() || "";
  }

  if (file.type.startsWith("video/")) {
    const env = serverEnv();
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        { text: "Analise este vídeo e descreva o conteúdo, falas e informações principais em português." },
        { inlineData: { mimeType: file.type, data: buffer.toString("base64") } },
      ],
    });
    return response.text?.trim() || "";
  }

  throw new Error("Formato de arquivo não suportado");
}

export async function transcribeAudio(file: File): Promise<string> {
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const env = serverEnv();
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const mime = file.type || "audio/ogg";
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      { text: "Transcreva este áudio em português brasileiro, mantendo a pontuação e os nomes próprios." },
      { inlineData: { mimeType: mime, data: buffer.toString("base64") } },
    ],
  });
  return response.text?.trim() || "";
}
