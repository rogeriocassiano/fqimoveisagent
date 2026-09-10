import { adminDb } from "@/lib/supabase";
import { z } from "zod";
import { searchProperties } from "@/lib/properties";
import { NextRequest, NextResponse } from "next/server";

const filtersSchema = z.object({ city: z.string().optional(), neighborhood: z.string().optional(), type: z.string().optional(), bedrooms: z.coerce.number().int().positive().optional(), minPrice: z.coerce.number().nonnegative().optional(), maxPrice: z.coerce.number().nonnegative().optional() });

const propertySchema = z.object({
  reference: z.string().min(1),
  title: z.string().min(1),
  type: z.string().default("apartamento"),
  city: z.string().default("Belo Horizonte"),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  bedrooms: z.coerce.number().optional(),
  suites: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
  parking_spaces: z.coerce.number().optional(),
  area: z.coerce.number().optional(),
  sale_price: z.coerce.number().optional(),
  status: z.string().default("available"),
  url: z.string().optional(),
  payload: z.any().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = filtersSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Filtros inválidos" }, { status: 400 });
  try {
    return Response.json({ properties: await searchProperties(parsed.data) });
  } catch (error) {
    console.error("property_search_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível consultar os imóveis" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const db = adminDb();
  const body = await req.json();
  const parsed = propertySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const data = {
    ...parsed.data,
    organization_id: "becdb86d-102f-495a-8d53-d094ff3c2ad6",
    payload: {},
  };

  const { data: inserted, error } = await db.from("properties").upsert(data, { onConflict: "organization_id, reference" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ property: inserted });
}
