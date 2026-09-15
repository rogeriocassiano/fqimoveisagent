"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import MicButton from "../../components/MicButton";


type Source = { id: string; type: string; title: string; uri?: string; status: string };
type Agent = { id: string; name: string; persona: string; tone: string; status: string; sources: Source[] };
type ChatMsg = { role: "user" | "assistant"; text: string; fileName?: string };

type Tab = "fontes" | "testar";

export default function AgentDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("fontes");
  const [sourceForm, setSourceForm] = useState<{ type: "text" | "url" | "document"; title: string; content: string; uri: string; file?: File }>({ type: "text", title: "", content: "", uri: "" });
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1]; if (!token) router.push("/login"); }, [router]);
  useEffect(() => { fetch(`/api/agents/${id}`).then((r) => r.json()).then((data) => setAgent(data.agent)); }, [id]);
  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    const body = new FormData();
    body.append("type", sourceForm.type);
    body.append("title", sourceForm.title);
    if (sourceForm.type === "text") body.append("content", sourceForm.content);
    if (sourceForm.type === "url") body.append("uri", sourceForm.uri);
    if (sourceForm.file) body.append("file", sourceForm.file);
    const res = await fetch(`/api/agents/${id}/sources`, { method: "POST", body });
    const data = await res.json();
    if (res.ok && agent) {
      setAgent({ ...agent, sources: [...agent.sources, data.source] });
      setSourceForm({ type: "text", title: "", content: "", uri: "", file: undefined });
    } else {
      alert(data.error || "Erro ao adicionar fonte");
    }
  }

  async function train(sourceId: string) {
    setTraining(sourceId);
    const res = await fetch(`/api/agents/${id}/train`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_id: sourceId }) });
    setTraining(null);
    if (!res.ok) { const data = await res.json(); alert(data.error || "Erro ao treinar"); }
    else setAgent((prev) => prev ? { ...prev, sources: prev.sources.map((s) => (s.id === sourceId ? { ...s, status: "ready" } : s)) } : prev);
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!message.trim() && !sourceForm.file) return;
    const userText = message || (sourceForm.file ? `[Anexo: ${sourceForm.file.name}]` : "");
    setChat((prev) => [...prev, { role: "user", text: userText, fileName: sourceForm.file?.name }]);
    setLoading(true); setMessage("");
    const body = new FormData();
    body.append("message", message);
    if (sourceForm.file) body.append("file", sourceForm.file);
    const res = await fetch(`/api/agents/${id}/chat`, { method: "POST", body });
    const data = await res.json();
    setChat((prev) => [...prev, { role: "assistant", text: data.answer || data.error || "Erro" }]);
    setLoading(false); setSourceForm((prev) => ({ ...prev, file: undefined }));
  }

  if (!agent) return <main style={{ padding: 24 }}><p className="lead">Carregando...</p></main>;

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Treinamento</p>
          <h1 style={{ margin: "4px 0 8px" }}>{agent.name}</h1>
          <p className="lead">{agent.persona || "Sem persona definida"} · {agent.tone || "sem tom"}</p>
        </div>
        <Link href="/admin" className="button ghost">Voltar</Link>
      </div>

      <nav style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab("fontes")} className={tab === "fontes" ? "" : "ghost"}>Fontes</button>
        <button onClick={() => setTab("testar")} className={tab === "testar" ? "" : "ghost"}>Testar agente</button>
      </nav>

      {tab === "fontes" && (
        <>
          <section className="card" style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>📚</span>
              <h2 style={{ margin: 0 }}>Adicionar fonte</h2>
            </div>
            <form onSubmit={addSource} style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <select value={sourceForm.type} onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value as "text" | "url" | "document", file: undefined })} style={{ gridColumn: "span 1" }}>
                  <option value="text">Texto</option>
                  <option value="url">Site</option>
                  <option value="document">PDF / Excel / TXT</option>
                </select>
                <input value={sourceForm.title} onChange={(e) => setSourceForm({ ...sourceForm, title: e.target.value })} placeholder="Título da fonte" required />
              </div>
              {sourceForm.type === "text" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea value={sourceForm.content} onChange={(e) => setSourceForm({ ...sourceForm, content: e.target.value })} placeholder="Cole aqui o conteúdo (livro, treinamento, conversa, apresentação...) ou dite pelo microfone" rows={6} style={{ flex: 1 }} />
                  <MicButton onText={(t) => setSourceForm((prev) => ({ ...prev, content: prev.content ? `${prev.content}\n\n${t}` : t }))} title="Ditar conteúdo" />
                </div>
              )}
              {sourceForm.type === "url" && (
                <input value={sourceForm.uri} onChange={(e) => setSourceForm({ ...sourceForm, uri: e.target.value })} placeholder="https://..." />
              )}
              {sourceForm.type === "document" && (
                <div style={{ padding: 16, border: "1px dashed var(--line)", borderRadius: 12, textAlign: "center" }}>
                  <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.doc,.docx,.md" onChange={(e) => setSourceForm({ ...sourceForm, file: e.target.files?.[0] })} style={{ display: "none" }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="ghost">📎 Escolher arquivo</button>
                  {sourceForm.file && <p style={{ color: "var(--muted)", marginTop: 8 }}>{sourceForm.file.name}</p>}
                </div>
              )}
              <button type="submit" style={{ justifySelf: "start" }}>Adicionar</button>
            </form>
          </section>

          <section>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Fontes do agente</h2>
            {agent.sources.length === 0 && <p style={{ color: "var(--muted)" }}>Nenhuma fonte adicionada ainda.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
              {agent.sources.map((source) => (
                <div key={source.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px" }}>{source.title}</h3>
                    <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>Tipo: {source.type}</p>
                    <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>Status: <span style={{ color: source.status === "ready" ? "#22c55e" : "var(--accent)" }}>{source.status}</span></p>
                  </div>
                  <button onClick={() => train(source.id)} disabled={training === source.id} style={{ marginTop: 12 }}>{training === source.id ? "Treinando..." : "Treinar"}</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "testar" && (
        <section className="card" style={{ display: "flex", flexDirection: "column", height: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>💬</span>
            <h2 style={{ margin: 0 }}>Testar agente</h2>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 16, border: "1px solid var(--line)", borderRadius: 12, marginBottom: 16, background: "var(--bg)" }}>
            {chat.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center" }}>Envie uma mensagem, áudio, foto ou arquivo para testar.</p>}
            {chat.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "70%", padding: 12, borderRadius: 16, background: m.role === "user" ? "var(--user-bg)" : "var(--assistant-bg)", border: "1px solid var(--line)" }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>
                  {m.fileName && <p style={{ fontSize: ".75rem", color: "var(--muted)", margin: "4px 0 0" }}>Anexo: {m.fileName}</p>}
                </div>
              </div>
            ))}
            {loading && <p style={{ color: "var(--muted)" }}>Agente está pensando...</p>}
            <div ref={chatRef} />
          </div>

          <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.xlsx,.xls,.csv,.txt,.doc,.docx" onChange={(e) => setSourceForm((prev) => ({ ...prev, file: e.target.files?.[0] }))} style={{ display: "none" }} />
            <button type="button" className="icon ghost" onClick={() => fileRef.current?.click()} title="Anexar arquivo">📎</button>
            <MicButton onText={(t) => setMessage((prev) => (prev ? prev + " " : "") + t)} title="Falar mensagem" />
            {sourceForm.file && sourceForm.file.type.startsWith("image/") && <Image src={URL.createObjectURL(sourceForm.file)} alt="preview" width={60} height={40} style={{ borderRadius: 4, objectFit: "cover" }} />}
            <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendMessage(); }} placeholder="Escreva uma pergunta..." style={{ flex: 1 }} />
            <button type="submit" disabled={loading || (!message.trim() && !sourceForm.file)} className="icon">➤</button>
          </form>
        </section>
      )}
    </main>
  );
}
