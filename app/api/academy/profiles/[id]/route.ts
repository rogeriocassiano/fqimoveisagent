import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasAdminAccess(user.role)) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const db = adminDb();
  const { id } = await params;
  const body = await req.json();
  const { data, error } = await db.from("training_profiles").update({
    ordem: body.ordem,
    ativo: body.ativo,
    nome: body.nome,
    negocio: body.negocio,
    emoji: body.emoji,
    dor: body.dor,
    estilo: body.estilo,
    prompt_instrucoes: body.prompt_instrucoes,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const db = adminDb();
  const { id } = await params;
  const { error } = await db.from("training_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
