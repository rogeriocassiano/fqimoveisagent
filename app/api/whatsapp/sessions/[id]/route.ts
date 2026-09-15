import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { getWaStatus, deleteWaSession } from "@/lib/wa-service";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!hasAdminAccess(user.role)) return { error: NextResponse.json({ error: "Não autorizado" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const db = adminDb();
  const { data: session } = await db.from("wa_sessions").select("id, agent_id, phone, status").eq("id", id).eq("organization_id", user.organizationId).single();
  if (!session) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

  try {
    const { data: live } = await getWaStatus(id);
    if (live.status && live.status !== session.status) {
      await db.from("wa_sessions").update({ status: live.status, phone: live.phone ?? session.phone, updated_at: new Date().toISOString() }).eq("id", id);
    }
    return NextResponse.json({ status: live.status ?? session.status, phone: live.phone ?? session.phone });
  } catch {
    return NextResponse.json({ status: session.status, phone: session.phone });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const { id } = await params;

  const db = adminDb();
  const { data: session } = await db.from("wa_sessions").select("id").eq("id", id).eq("organization_id", user.organizationId).single();
  if (!session) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

  try { await deleteWaSession(id); } catch { /* serviço fora — remove mesmo assim */ }
  await db.from("wa_sessions").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
