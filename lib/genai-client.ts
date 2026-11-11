import { GoogleGenAI } from "@google/genai";

/**
 * Cliente Gemini unificado:
 * - Se GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CLOUD_PROJECT estiverem setados → Vertex AI (fatura GCP)
 * - Senão → API key do AI Studio (GEMINI_API_KEY)
 */
export function genaiClient(): GoogleGenAI {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (saJson && project) {
    const credentials = JSON.parse(saJson);
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
      apiVersion: process.env.GOOGLE_VERTEX_API_VERSION ?? "v1",
      googleAuthOptions: { credentials },
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Nem GOOGLE_SERVICE_ACCOUNT_JSON nem GEMINI_API_KEY configurados");
  return new GoogleGenAI({ apiKey });
}
