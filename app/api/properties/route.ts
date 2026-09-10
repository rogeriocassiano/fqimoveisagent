import { z } from "zod";
import { searchProperties } from "@/lib/properties";

const filtersSchema = z.object({ city: z.string().optional(), neighborhood: z.string().optional(), type: z.string().optional(), bedrooms: z.coerce.number().int().positive().optional(), minPrice: z.coerce.number().nonnegative().optional(), maxPrice: z.coerce.number().nonnegative().optional() });

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
