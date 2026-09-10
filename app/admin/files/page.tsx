"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FileItem = { id: string; title: string; type: string; uri: string; status: string; created_at: string; publicUrl: string; agents: { name: string } };

export default function FilesPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) router.push("/login");
  }, [router]);

  useEffect(() => {
    fetch("/api/files")
      .then((r) => r.json())
      .then((data) => { setFiles(data.files ?? []); setLoading(false); });
  }, []);

  return (
    <main>
      <p className="eyebrow">Arquivos</p>
      <h1>Documentos enviados</h1>
      <p className="lead">PDFs, planilhas e textos salvos no Storage.</p>
      {loading ? <p>Carregando...</p> : (
        <section className="grid" style={{ marginTop: 24 }}>
          {files.map((file) => (
            <article className="card" key={file.id}>
              <h2>{file.title}</h2>
              <p><strong>Agente:</strong> {file.agents?.name || "—"}</p>
              <p><strong>Status:</strong> {file.status}</p>
              <p><strong>Data:</strong> {new Date(file.created_at).toLocaleString("pt-BR")}</p>
              <a href={file.publicUrl} target="_blank" rel="noreferrer" className="button secondary">Abrir arquivo</a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
