import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "./env";

export async function embedText(text: string): Promise<number[]> {
  const env = serverEnv();
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: [text],
    config: { outputDimensionality: 768 },
  });
  const embedding = response.embeddings?.[0];
  if (!embedding?.values) throw new Error("Embedding vazio");
  const values = Array.from(embedding.values).slice(0, 768);
  if (values.length !== 768) throw new Error(`Embedding com dimensão ${values.length}, esperado 768`);
  return values;
}
