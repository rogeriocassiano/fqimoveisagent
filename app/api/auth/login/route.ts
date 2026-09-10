import { createSupabaseClient } from "@/lib/supabase-client";

export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({})) as { email?: string; password?: string };
  if (!email || !password) return Response.json({ error: "Email e senha obrigatórios" }, { status: 400 });

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) return Response.json({ error: error?.message || "Login inválido" }, { status: 401 });

  return Response.json({
    user: data.user,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
}
