import { extractTextFromFile } from "@/lib/extract";
import { getSessionUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return Response.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const text = await extractTextFromFile(file);
    return Response.json({ text });
  } catch (error) {
    console.error("extract_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível extrair o conteúdo" }, { status: 503 });
  }
}
