import { createSupabaseClient } from "@/lib/supabase-client";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    const supabase = createSupabaseClient();
    await supabase.auth.admin.signOut?.(token).catch(() => null);
  }
  return Response.json({ ok: true });
}
