import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { startWaSession, getWaStatus } from "@/lib/wa-service";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!hasAdminAccess(user.role)) return { error: NextResponse.json({ error: "Não autorizado" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const db = adminDb();
  const { data, error: dbError } = await db
    .from("wa_sessions")
    .select("id, agent_id, phone, status, created_at, agents(name)")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // enriquece com status ao vivo do serviço (best-effort)
  const sessions = await Promise.all(
    (data ?? []).map(async (s) => {
      try {
        const { data: live } = await getWaStatus(s.id);
        return { ...s, status: live.status ?? s.status, phone: live.phone ?? s.phone };
      } catch {
        return s;
      }
    })
  );
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const agentId = body.agentId;
  if (!agentId) return NextResponse.json({ error: "agentId obrigatório" }, { status: 400 });

  const db = adminDb();
  // "all" = agente geral (todo o contexto) → agent_id fica null
  const dbAgentId = agentId === "all" ? null : agentId;
  if (dbAgentId) {
    const { data: agent } = await db.from("agents").select("id").eq("id", dbAgentId).eq("organization_id", user.organizationId).single();
    if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const { data: session, error: insertError } = await db
    .from("wa_sessions")
    .insert({ organization_id: user.organizationId, agent_id: dbAgentId, status: "connecting" })
    .select("id")
    .single();
  if (insertError || !session) return NextResponse.json({ error: insertError?.message || "Falha ao criar sessão" }, { status: 500 });

  try {
    await startWaSession(session.id);
  } catch (err) {
    await db.from("wa_sessions").delete().eq("id", session.id);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Serviço WhatsApp indisponível" }, { status: 503 });
  }

  return NextResponse.json({ session: { id: session.id } }, { status: 201 });
}
