import { adminDb } from "./supabase";

export async function uploadFile(file: File, folder = "documents"): Promise<{ path: string; publicUrl: string }> {
  const db = adminDb();
  const path = `${folder}/${crypto.randomUUID()}-${file.name}`;
  const { data, error } = await db.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error || !data) throw error ?? new Error("Falha ao fazer upload");
  const { data: urlData } = db.storage.from("documents").getPublicUrl(data.path);
  return { path: data.path, publicUrl: urlData.publicUrl };
}

export async function downloadFile(path: string): Promise<Blob> {
  const db = adminDb();
  const { data, error } = await db.storage.from("documents").download(path);
  if (error || !data) throw error ?? new Error("Falha ao baixar arquivo");
  return data;
}
