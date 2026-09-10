import { getAgent } from "@/lib/agent";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const agent = await getAgent(id);
    return Response.json({ agent });
  } catch (error) {
    console.error("get_agent_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível carregar o agente" }, { status: 503 });
  }
}
