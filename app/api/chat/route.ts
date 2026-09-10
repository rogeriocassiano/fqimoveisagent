import { z } from "zod";
import { answerWithGemini } from "@/lib/gemini";

const bodySchema = z.object({ message: z.string().trim().min(1).max(4000), context: z.string().max(20000).optional() });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mensagem inválida" }, { status: 400 });
  try {
    const answer = await answerWithGemini(parsed.data.message, parsed.data.context);
    return Response.json({ answer });
  } catch (error) {
    console.error("chat_request_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível responder agora" }, { status: 503 });
  }
}
