import { z } from "zod";
import { createAgent, listAgents } from "@/lib/agent";

const createSchema = z.object({
  name: z.string().min(1),
  persona: z.string().optional(),
  tone: z.string().optional(),
  system_prompt: z.string().optional(),
});

export async function GET() {
  try {
    const agents = await listAgents();
    return Response.json({ agents });
  } catch (error) {
    console.error("list_agents_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível listar agentes" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    const agent = await createAgent(parsed.data);
    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("create_agent_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível criar o agente" }, { status: 503 });
  }
}
