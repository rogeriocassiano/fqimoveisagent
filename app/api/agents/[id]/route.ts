import { getAgent } from "@/lib/agent";
import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { deleteWaSession } from "@/lib/wa-service";
import { NextRequest, NextResponse } from "next/server";

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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasAdminAccess(user.role)) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id } = await params;
  const db = adminDb();

  const { data: agent } = await db
    .from("agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .single();
  if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });

  // sessões WhatsApp vinculadas ao agente: desconecta no serviço e remove,
  // senão o `on delete set null` as converteria em "agente geral" por acidente
  try {
    const { data: waSessions } = await db
      .from("wa_sessions")
      .select("id")
      .eq("agent_id", id)
      .eq("organization_id", user.organizationId);
    for (const s of waSessions ?? []) {
      try { await deleteWaSession(s.id); } catch { /* serviço indisponível: segue */ }
    }
    await db.from("wa_sessions").delete().eq("agent_id", id).eq("organization_id", user.organizationId);
  } catch { /* tabela wa_sessions pode não existir ainda */ }

  const { error: delError } = await db
    .from("agents")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organizationId);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
