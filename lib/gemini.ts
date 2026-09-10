import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "./env";

const SYSTEM_INSTRUCTION = `Você é o assistente virtual da FQ Imóveis. Responda em português brasileiro, de forma objetiva e cordial. Identifique-se como assistente virtual quando falar com clientes. Nunca invente imóveis, preço, endereço ou disponibilidade. Dados de estoque devem vir exclusivamente do contexto estruturado fornecido. Quando não houver informação suficiente, diga isso claramente e ofereça atendimento humano.`;

export async function answerWithGemini(message: string, context = "") {
  const env = serverEnv();
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: `${context ? `Contexto confiável:\n${context}\n\n` : ""}Pergunta: ${message}`,
    config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
  });
  return response.text ?? "Não consegui formular uma resposta agora.";
}
