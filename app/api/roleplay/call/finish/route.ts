import { adminDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";
import { getConversation, deleteCallAgent } from "@/lib/elevenlabs";
import { NextRequest, NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = adminDb();
  try {
    const { sessionId, conversationId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId é obrigatório" }, { status: 400 });

    const { data: session } = await db.from("roleplay_sessions").select("id, mensagens, feedback").eq("id", sessionId).single();
    if (!session) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

    if (conversationId) {
      // A transcrição pode demorar alguns segundos para ficar disponível
      let convo = await getConversation(conversationId).catch(() => null);
      if (convo && (!convo.transcript || convo.transcript.length === 0) && convo.status !== "done") {
        await sleep(2000);
        convo = await getConversation(conversationId).catch(() => convo);
      }

      const mensagens = (convo?.transcript ?? [])
        .filter((t) => t.message?.trim())
        .map((t) => ({ role: (t.role === "agent" ? "assistant" : "user") as "assistant" | "user", content: t.message.trim() }));

      if (mensagens.length > 0) {
        await db.from("roleplay_sessions").update({
          mensagens,
          duracao_segundos: Math.round(convo?.metadata?.call_duration_secs ?? 0),
        }).eq("id", sessionId);
      }
    }

    // Remove apenas agentes temporários (o agente fixo do perfil é preservado)
    const fb = session.feedback as { el_agent_id?: string; ephemeral?: boolean } | null;
    if (fb?.ephemeral && fb.el_agent_id) await deleteCallAgent(fb.el_agent_id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("roleplay_call_finish_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível finalizar a ligação" }, { status: 500 });
  }
}
