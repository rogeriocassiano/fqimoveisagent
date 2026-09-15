import { adminDb } from "@/lib/supabase";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    const db = adminDb();
    await db.auth.admin.signOut(token).catch(() => null);
  }
  return Response.json({ ok: true });
}
