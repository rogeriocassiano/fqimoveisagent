import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { searchProperties } from "@/lib/properties";
import { adminDb } from "@/lib/supabase";
import { z } from "zod";

const filtersSchema = z.object({ city: z.string().optional(), neighborhood: z.string().optional(), type: z.string().optional(), bedrooms: z.coerce.number().int().positive().optional(), minPrice: z.coerce.number().nonnegative().optional(), maxPrice: z.coerce.number().nonnegative().optional(), reference: z.string().optional(), q: z.string().optional() });
const propertySchema = z.object({
  id: z.string().uuid().optional(), reference: z.string().min(1), title: z.string().min(1), type: z.string().default("apartamento"), city: z.string().default("Belo Horizonte"), neighborhood: z.string().optional(), address: z.string().optional(), bedrooms: z.coerce.number().optional(), suites: z.coerce.number().optional(), bathrooms: z.coerce.number().optional(), parking_spaces: z.coerce.number().optional(), area: z.coerce.number().optional(), sale_price: z.coerce.number().optional(), status: z.string().default("available"), url: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = filtersSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Filtros inválidos" }, { status: 400 });
  try { return Response.json({ properties: await searchProperties(parsed.data) }); }
  catch (error) { console.error("property_search_failed", error instanceof Error ? error.message : "unknown"); return Response.json({ error: "Não foi possível consultar os imóveis" }, { status: 503 }); }
}

async function save(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });
  if (!hasAdminAccess(user.role)) return Response.json({ error: "Acesso restrito à administração" }, { status: 403 });
  const parsed = propertySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { id, ...values } = parsed.data;
  const db = adminDb();
  const data = { ...values, organization_id: user.organizationId, payload: values.payload ?? {}, updated_at: new Date().toISOString() };
  const query = id ? db.from("properties").update(data).eq("id", id).eq("organization_id", user.organizationId) : db.from("properties").upsert(data, { onConflict: "organization_id, reference" });
  const { data: property, error } = await query.select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await db.from("audit_log").insert({ organization_id: user.organizationId, user_id: user.id, action: id ? "update" : "create", entity: "property", diff: { id: property.id, reference: property.reference } });
  return Response.json({ property });
}

export async function POST(request: Request) { return save(request); }
export async function PATCH(request: Request) { return save(request); }
