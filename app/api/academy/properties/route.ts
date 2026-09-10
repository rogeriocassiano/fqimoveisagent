import { adminDb } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.toLowerCase() || "";
  const min = url.searchParams.get("minPrice");
  const max = url.searchParams.get("maxPrice");
  const neighborhood = url.searchParams.get("neighborhood") || "";

  const db = adminDb();
  let query = db.from("properties").select("id, reference, title, sale_price, address, neighborhood, bedrooms, suites, bathrooms, parking_spaces, area, url, payload, status").eq("status", "available").order("title");

  if (search) query = query.or(`title.ilike.%${search}%,neighborhood.ilike.%${search}%,reference.ilike.%${search}%`);
  if (min) query = query.gte("sale_price", Number(min));
  if (max) query = query.lte("sale_price", Number(max));
  if (neighborhood) query = query.ilike("neighborhood", `%${neighborhood}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ properties: data ?? [] });
}
