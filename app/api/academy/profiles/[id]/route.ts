import { adminDb } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const db = adminDb();
  const { id } = await params;
  const { error } = await db.from("training_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
