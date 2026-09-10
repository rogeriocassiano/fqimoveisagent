import { z } from "zod";
import { trainSource } from "@/lib/agent";

const trainSchema = z.object({ source_id: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = trainSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    const result = await trainSource(parsed.data.source_id);
    return Response.json({ agent_id: id, ...result });
  } catch (error) {
    console.error("train_source_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível treinar a fonte" }, { status: 503 });
  }
}
