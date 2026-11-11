import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!hasAdminAccess(user.role)) return { error: NextResponse.json({ error: "Não autorizado" }, { status: 403 }) };
  return { user };
}

/** Persiste o agente público padrão: atualiza wa_sessions.agent_id da organização. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const { agentId } = await req.json();
  const dbAgentId = agentId === "all" || !agentId ? null : agentId;

  const db = adminDb();
  if (dbAgentId) {
    const { data: agent } = await db.from("agents").select("id").eq("id", dbAgentId).eq("organization_id", user.organizationId).maybeSingle();
    if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const { error: updError } = await db
    .from("wa_sessions")
    .update({ agent_id: dbAgentId })
    .eq("organization_id", user.organizationId);
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });

  return NextResponse.json({ ok: true, agentId: dbAgentId });
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const db = adminDb();
  const { data } = await db
    .from("wa_sessions")
    .select("agent_id")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ agentId: data?.agent_id ?? null });
}
