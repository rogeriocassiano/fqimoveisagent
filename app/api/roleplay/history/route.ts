import { adminDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = adminDb();
  const { data, error } = await db.from("roleplay_sessions").select("*, training_modules(titulo), training_profiles(nome)").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
