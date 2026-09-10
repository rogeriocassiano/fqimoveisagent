import { adminDb } from "./supabase";

export type PropertyFilters = { city?: string; neighborhood?: string; type?: string; bedrooms?: number; minPrice?: number; maxPrice?: number };

export async function searchProperties(filters: PropertyFilters, limit = 8) {
  let query = adminDb().from("properties").select("reference,title,type,city,neighborhood,bedrooms,parking_spaces,sale_price,status,url,updated_at").eq("status", "available").limit(limit);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.neighborhood) query = query.ilike("neighborhood", `%${filters.neighborhood}%`);
  if (filters.type) query = query.ilike("type", `%${filters.type}%`);
  if (filters.bedrooms) query = query.gte("bedrooms", filters.bedrooms);
  if (filters.minPrice) query = query.gte("sale_price", filters.minPrice);
  if (filters.maxPrice) query = query.lte("sale_price", filters.maxPrice);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
