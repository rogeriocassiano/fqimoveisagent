import { z } from "zod";
import { addSource } from "@/lib/agent";

const sourceSchema = z.object({
  type: z.enum(["text", "url", "audio", "document"]),
  title: z.string().min(1),
  content: z.string().optional(),
  uri: z.string().url().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";

  try {
    let type: "text" | "url" | "audio" | "document" = "text";
    let title = "";
    let content = "";
    let uri = "";
    let file: File | undefined;

    const normalizeType = (t: string): typeof type => {
      if (t === "image" || t === "video") return "document";
      if (t === "url" || t === "document" || t === "audio" || t === "text") return t as typeof type;
      return "text";
    };

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const t = form.get("type");
      type = normalizeType(t as string);
      title = (form.get("title") as string) || "";
      content = (form.get("content") as string) || "";
      uri = (form.get("uri") as string) || "";
      const f = form.get("file");
      if (f instanceof File) file = f;
    } else {
      const parsed = sourceSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Dados inválidos" }, { status: 400 });
      type = parsed.data.type;
      title = parsed.data.title;
      content = parsed.data.content || "";
      uri = parsed.data.uri || "";
    }

    if (!title) return Response.json({ error: "Título obrigatório" }, { status: 400 });

    const source = await addSource(id, { type, title, content, uri, file });
    return Response.json({ source }, { status: 201 });
  } catch (error) {
    console.error("add_source_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível adicionar a fonte" }, { status: 503 });
  }
}
