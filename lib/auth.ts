import { adminDb } from "./supabase";

export type UserRole = "admin" | "director" | "broker" | "trainee";

export async function getSessionUser(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.match(/sb-access-token=([^;]+)/)?.[1];
  if (!token) return null;

  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await db.from("profiles").select("id, organization_id, role, name").eq("id", data.user.id).single();
  if (!profile) return null;

  return { id: profile.id as string, organizationId: profile.organization_id as string, role: profile.role as UserRole, name: profile.name as string | null };
}

export function hasAdminAccess(role: UserRole) {
  return role === "admin" || role === "director";
}
