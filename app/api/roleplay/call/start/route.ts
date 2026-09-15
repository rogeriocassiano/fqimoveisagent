import { adminDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";
import { createCallAgent, getSignedUrl, buildVoicePrompt, firstMessageFor } from "@/lib/elevenlabs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = adminDb();
  try {
    const { moduloId, perfilId } = await req.json();
    if (!moduloId || !perfilId) return NextResponse.json({ error: "Módulo e perfil são obrigatórios" }, { status: 400 });

    const { data: modulo } = await db.from("training_modules").select("*").eq("id", moduloId).single();
    if (!modulo) return NextResponse.json({ error: "Módulo não encontrado" }, { status: 404 });

    const { data: perfil } = await db.from("training_profiles").select("*").eq("id", perfilId).single();
    if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

    const { data: orgAgents } = await db.from("agents").select("id").eq("organization_id", user.organizationId).order("created_at", { ascending: false }).limit(1);
    let agentId = orgAgents?.[0]?.id as string | undefined;
    if (!agentId) {
      const { data: anyAgents } = await db.from("agents").select("id").order("created_at", { ascending: false }).limit(1);
      agentId = anyAgents?.[0]?.id as string | undefined;
    }
    if (!agentId) return NextResponse.json({ error: "Nenhum agente disponível" }, { status: 404 });

    const firstMessage = firstMessageFor(perfil);

    // Usa o agente fixo do perfil no ElevenLabs; se não existir, cria um temporário
    let elAgentId = perfil.elevenlabs_agent_id as string | null;
    let ephemeral = false;
    if (!elAgentId) {
      elAgentId = await createCallAgent(`FQ Roleplay - ${perfil.nome}`, buildVoicePrompt(perfil), firstMessage);
      ephemeral = true;
    }
    const signedUrl = await getSignedUrl(elAgentId);

    const { data: session, error } = await db.from("roleplay_sessions").insert({
      agent_id: agentId,
      vendedor_email: user.name || user.id,
      modulo_id: moduloId,
      perfil_id: perfilId,
      mensagens: [{ role: "assistant", content: firstMessage }],
      feedback: { el_agent_id: elAgentId, ephemeral, modo: "ligacao" },
    }).select("id").single();

    if (error || !session) {
      console.error("insert_session_error", error);
      return NextResponse.json({ error: error?.message || "Falha ao criar sessão" }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: session.id,
      signedUrl,
      elAgentId,
      message: firstMessage,
      dynamicVariables: { modulo_titulo: modulo.titulo, modulo_objetivo: modulo.objetivo },
    });
  } catch (error) {
    console.error("roleplay_call_start_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível iniciar a ligação" }, { status: 500 });
  }
}
