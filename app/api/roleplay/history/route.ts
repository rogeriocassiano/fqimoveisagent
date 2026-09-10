import { adminDb } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const db = adminDb();
  const { data, error } = await db.from("roleplay_sessions").select("*, training_modules(titulo), training_profiles(nome), training_evaluations(*)").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
