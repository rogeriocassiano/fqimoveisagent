import { adminDb } from "./supabase";

export type PropertyFilters = { city?: string; neighborhood?: string; type?: string; bedrooms?: number; minPrice?: number; maxPrice?: number; reference?: string; q?: string };

export async function searchProperties(filters: PropertyFilters, limit = 1000) {
  let query = adminDb().from("properties").select("reference,title,type,city,neighborhood,address,bedrooms,suites,bathrooms,parking_spaces,area,sale_price,status,url,payload,updated_at").eq("status", "available").limit(limit);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.neighborhood) query = query.ilike("neighborhood", `%${filters.neighborhood}%`);
  if (filters.type) query = query.ilike("type", `%${filters.type}%`);
  if (filters.bedrooms) query = query.gte("bedrooms", filters.bedrooms);
  if (filters.minPrice) query = query.gte("sale_price", filters.minPrice);
  if (filters.maxPrice) query = query.lte("sale_price", filters.maxPrice);
  if (filters.reference) query = query.eq("reference", filters.reference);
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,reference.ilike.%${filters.q}%,neighborhood.ilike.%${filters.q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
