import { adminDb } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const db = adminDb();
  const { data, error } = await db.from("training_profiles").select("*").order("ordem");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = adminDb();
  const body = await req.json();
  const { data, error } = await db.from("training_profiles").insert({
    ordem: body.ordem ?? 0,
    ativo: body.ativo ?? true,
    nome: body.nome,
    negocio: body.negocio ?? "",
    emoji: body.emoji ?? "",
    dor: body.dor ?? "",
    estilo: body.estilo ?? "",
    prompt_instrucoes: body.prompt_instrucoes ?? "",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
