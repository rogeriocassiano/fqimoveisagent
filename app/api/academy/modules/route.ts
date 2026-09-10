import { adminDb } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const db = adminDb();
  const { data, error } = await db.from("training_modules").select("*").order("ordem");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = adminDb();
  const body = await req.json();
  const { data, error } = await db.from("training_modules").insert({
    ordem: body.ordem ?? 0,
    ativo: body.ativo ?? true,
    titulo: body.titulo,
    descricao: body.descricao ?? "",
    objetivo: body.objetivo ?? "",
    emoji: body.emoji ?? "",
    dificuldade: body.dificuldade ?? "Médio",
    prompt_instrucoes: body.prompt_instrucoes ?? "",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ module: data });
}
