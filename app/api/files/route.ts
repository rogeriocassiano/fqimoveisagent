import { adminDb } from "@/lib/supabase";

export async function GET() {
  try {
    const db = adminDb();
    const { data: sources, error } = await db
      .from("sources")
      .select("id, title, type, uri, status, created_at, agents(name)")
      .eq("type", "document")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const files = (sources ?? []).map((s: Record<string, unknown>) => {
      const uri = (s.uri as string) || "";
      const publicUrl = uri.startsWith("http")
        ? uri
        : `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "")}/storage/v1/object/public/documents/${uri}`;
      return { ...s, publicUrl };
    });

    return Response.json({ files });
  } catch (error) {
    console.error("list_files_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Erro ao listar arquivos" }, { status: 503 });
  }
}
