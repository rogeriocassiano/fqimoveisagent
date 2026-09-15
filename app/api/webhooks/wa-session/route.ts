import { adminDb } from "@/lib/supabase";
import { chatWithAgent, chatWithAllAgents } from "@/lib/agent";
import { NextRequest, NextResponse } from "next/server";

function authorized(req: NextRequest) {
  const secret = process.env.WA_SERVICE_SECRET;
  return secret && req.headers.get("x-wa-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type || !body.sessionId) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const db = adminDb();

  if (body.type === "status") {
    const update: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.phone) update.phone = body.phone;
    await db.from("wa_sessions").update(update).eq("id", body.sessionId);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "message") {
    const text = (body.text ?? "").toString().trim();
    if (!text) return NextResponse.json({ reply: null });

    const { data: session } = await db
      .from("wa_sessions")
      .select("id, agent_id, status")
      .eq("id", body.sessionId)
      .single();
    if (!session || session.status !== "connected") return NextResponse.json({ reply: null });

    try {
      const contactId = `wa:${body.from ?? "unknown"}`;
      // agent_id null = agente geral (contexto de todos os agentes)
      const { answer } = session.agent_id
        ? await chatWithAgent(session.agent_id, text, undefined, contactId)
        : await chatWithAllAgents(text, undefined, contactId);
      return NextResponse.json({ reply: answer });
    } catch (error) {
      console.error("wa_message_reply_failed", error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ reply: null });
    }
  }

  return NextResponse.json({ error: "Tipo desconhecido" }, { status: 400 });
}
