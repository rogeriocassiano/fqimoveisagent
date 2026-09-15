import { z } from "zod";
import { adminDb } from "@/lib/supabase";
import { getSessionUser, hasAdminAccess } from "@/lib/auth";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.enum(["admin", "director", "broker", "trainee"]).default("trainee"),
});

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user || !hasAdminAccess(user.role)) {
    return Response.json({ error: "Não autorizado" }, { status: 403 });
  }

  const db = adminDb();
  const { data: profiles, error } = await db.from("profiles").select("id, name, role, created_at").eq("organization_id", user.organizationId).order("created_at", { ascending: false });
  if (error) {
    console.error("list_users_failed", error.message);
    return Response.json({ error: "Não foi possível listar usuários" }, { status: 503 });
  }

  const { data: authUsers, error: authError } = await db.auth.admin.listUsers();
  if (authError) {
    console.error("list_auth_users_failed", authError.message);
  }
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]));

  return Response.json({
    users: (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      created_at: p.created_at,
      email: emailById.get(p.id as string) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user || !hasAdminAccess(user.role)) {
    return Response.json({ error: "Não autorizado" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });

  const { email, password, name, role } = parsed.data;
  const db = adminDb();

  const { data: existing } = await db.from("profiles").select("id").eq("organization_id", user.organizationId).maybeSingle();
  if (!existing) {
    // A organização deve ter sido criada por algum outro fluxo; cria aqui se faltar
    const { data: org } = await db.from("organizations").select("id").limit(1).maybeSingle();
    if (!org) {
      const { data: created } = await db.from("organizations").insert({ name: "FQ Imóveis" }).select("id").single();
      if (created) {
        await db.from("profiles").insert({ id: user.id, organization_id: created.id, role: user.role });
      }
    }
  }

  const { data: createdUser, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !createdUser.user) {
    console.error("create_user_failed", createError?.message || "unknown");
    return Response.json({ error: createError?.message || "Não foi possível criar o usuário" }, { status: 503 });
  }

  const { error: profileError } = await db.from("profiles").insert({
    id: createdUser.user.id,
    organization_id: user.organizationId,
    role,
    name: name || email.split("@")[0],
  });

  if (profileError) {
    console.error("create_profile_failed", profileError.message);
    // tenta remover o usuário criado para evitar órfão
    await db.auth.admin.deleteUser(createdUser.user.id);
    return Response.json({ error: "Erro ao salvar perfil do usuário" }, { status: 503 });
  }

  return Response.json({ user: { id: createdUser.user.id, email, role, name } }, { status: 201 });
}
