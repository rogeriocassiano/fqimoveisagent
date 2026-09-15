"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MicButton from "../components/MicButton";

type Agent = {
  id: string;
  name: string;
  persona: string;
  tone: string;
  status: string;
  created_at: string;
};

type SourceType = "text" | "url" | "document" | "audio" | "image" | "video";

export default function AdminPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({ name: "", persona: "", tone: "", system_prompt: "" });
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [sourceAgentId, setSourceAgentId] = useState("");
  const [sourceForm, setSourceForm] = useState<{ type: SourceType; title: string; content: string; uri: string; file?: File }>({ type: "document", title: "", content: "", uri: "" });
  const [sourceLoading, setSourceLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) router.push("/login");
  }, [router]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => { setAgents(data.agents ?? []); setSourceAgentId(data.agents?.[0]?.id ?? ""); });
  }, []);

  async function addSourceToAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceAgentId) { alert("Selecione um agente"); return; }
    setSourceLoading(true);
    const body = new FormData();
    body.append("type", sourceForm.type);
    body.append("title", sourceForm.title);
    if (sourceForm.type === "text") body.append("content", sourceForm.content);
    if (sourceForm.type === "url") body.append("uri", sourceForm.uri);
    if (sourceForm.file) body.append("file", sourceForm.file);
    const res = await fetch(`/api/agents/${sourceAgentId}/sources`, { method: "POST", body });
    const data = await res.json();
    setSourceLoading(false);
    if (res.ok) {
      setSourceForm({ type: "document", title: "", content: "", uri: "", file: undefined });
      alert("Fonte adicionada! Clique em 'Treinar' na página do agente.");
    } else {
      alert(data.error || "Erro ao adicionar fonte");
    }
  }

  async function excluirAgente(id: string, name: string) {
    if (!confirm(`Excluir o agente "${name}"?\n\nIsso apaga também fontes, treinamentos, conversas e sessões de WhatsApp vinculadas. Essa ação não pode ser desfeita.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(null);
    if (res.ok) {
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (sourceAgentId === id) setSourceAgentId("");
    } else {
      alert(data.error || "Erro ao excluir agente");
    }
  }

  async function suggest() {
    setSuggesting(true);
    const res = await fetch("/api/agents/suggest", { method: "POST" });
    const data = await res.json();
    setSuggesting(false);
    if (data.suggestion) {
      setForm((prev) => ({ ...prev, ...data.suggestion }));
    } else {
      alert(data.error || "Erro ao gerar sugestão");
    }
  }

  async function improve() {
    if (!form.system_prompt.trim()) { alert("Preencha o system prompt para melhorar"); return; }
    setImproving(true);
    const res = await fetch("/api/agents/improve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: form.system_prompt }),
    });
    const data = await res.json();
    setImproving(false);
    if (data.prompt) {
      setForm((prev) => ({ ...prev, system_prompt: data.prompt }));
    } else {
      alert(data.error || "Erro ao melhorar prompt");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setAgents([data.agent, ...agents]);
      setForm({ name: "", persona: "", tone: "", system_prompt: "" });
    } else {
      alert(data.error || "Erro ao criar agente");
    }
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Console do diretor</p>
          <h1 style={{ margin: "4px 0 8px" }}>Treinamento de agentes</h1>
          <p className="lead">Crie agentes, adicione fontes de conhecimento e teste o comportamento da IA.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/users" className="button ghost">Usuários</Link>
          <Link href="/admin/academy" className="button ghost">Gerenciar Academy</Link>
          <Link href="/admin/properties" className="button ghost">Apartamentos</Link>
          <Link href="/admin/whatsapp" className="button ghost">WhatsApp</Link>
          <Link href="/admin/settings" className="button ghost">Configurações</Link>
          <Link href="/admin/files" className="button ghost">Ver arquivos enviados</Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem" }}>🤖</span>
          <div>
            <h2 style={{ margin: 0 }}>Novo agente</h2>
            <p style={{ color: "var(--muted)", fontSize: ".85rem", margin: "2px 0 0" }}>Configure nome, persona, tom e instruções</p>
          </div>
        </div>

        <form onSubmit={create} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do agente" required />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} placeholder="Persona (ex: corretor especialista)" style={{ flex: 1 }} />
              <MicButton onText={(t) => setForm((prev) => ({ ...prev, persona: t }))} title="Ditar persona" />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder="Tom (ex: cordial, direto, formal)" style={{ flex: 1 }} />
              <MicButton onText={(t) => setForm((prev) => ({ ...prev, tone: t }))} title="Ditar tom" />
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <textarea
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="Instrução de sistema (system prompt)"
              rows={6}
              style={{ width: "100%", fontFamily: "monospace", fontSize: ".9rem" }}
            />
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <MicButton onText={(t) => setForm((prev) => ({ ...prev, system_prompt: prev.system_prompt ? `${prev.system_prompt}\n\n${t}` : t }))} title="Ditar prompt" />
              <button type="button" onClick={improve} disabled={improving} className="ghost" style={{ fontSize: ".8rem" }}>{improving ? "Melhorando..." : "✨ Melhorar prompt"}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={suggest} disabled={suggesting} className="ghost">{suggesting ? "Gerando..." : "✨ Sugerir com IA"}</button>
            <button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar agente"}</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>📚</span>
          <h2 style={{ margin: 0 }}>Adicionar conhecimento ao agente</h2>
        </div>
        <form onSubmit={addSourceToAgent} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <select value={sourceAgentId} onChange={(e) => setSourceAgentId(e.target.value)} required>
              <option value="">Selecione o agente</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={sourceForm.type} onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value as SourceType, file: undefined })}>
              <option value="text">Texto</option>
              <option value="url">Site / URL</option>
              <option value="document">PDF / Excel / TXT</option>
              <option value="audio">Áudio</option>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
            </select>
            <input value={sourceForm.title} onChange={(e) => setSourceForm({ ...sourceForm, title: e.target.value })} placeholder="Título da fonte" required />
          </div>
          {sourceForm.type === "text" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <textarea value={sourceForm.content} onChange={(e) => setSourceForm({ ...sourceForm, content: e.target.value })} placeholder="Cole aqui o conteúdo (livro, treinamento, conversa, apresentação...) ou dite pelo microfone" rows={5} style={{ flex: 1 }} />
              <MicButton onText={(t) => setSourceForm((prev) => ({ ...prev, content: prev.content ? `${prev.content}\n\n${t}` : t }))} title="Ditar conteúdo" />
            </div>
          )}
          {sourceForm.type === "url" && (
            <input value={sourceForm.uri} onChange={(e) => setSourceForm({ ...sourceForm, uri: e.target.value })} placeholder="https://..." />
          )}
          {(sourceForm.type === "document" || sourceForm.type === "audio" || sourceForm.type === "image" || sourceForm.type === "video") && (
            <div style={{ padding: 16, border: "1px dashed var(--line)", borderRadius: 12, textAlign: "center" }}>
              <input ref={fileRef} type="file" accept={sourceForm.type === "document" ? ".pdf,.xlsx,.xls,.csv,.txt,.doc,.docx,.md" : sourceForm.type === "audio" ? "audio/*" : sourceForm.type === "image" ? "image/*" : "video/*"} onChange={(e) => setSourceForm({ ...sourceForm, file: e.target.files?.[0] })} style={{ display: "none" }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="ghost">📎 Escolher arquivo</button>
              {sourceForm.file && <p style={{ color: "var(--muted)", marginTop: 8 }}>{sourceForm.file.name}</p>}
            </div>
          )}
          <button type="submit" disabled={sourceLoading} style={{ justifySelf: "start" }}>{sourceLoading ? "Enviando..." : "Adicionar fonte"}</button>
        </form>
      </section>

      <section>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Agentes criados</h2>
        {agents.length === 0 && <p style={{ color: "var(--muted)" }}>Nenhum agente criado ainda.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 16 }}>
          {agents.map((agent) => (
            <article key={agent.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</span>
                  <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{agent.name}</h3>
                </div>
                <p style={{ margin: "0 0 4px", fontSize: ".85rem", color: "var(--muted)" }}><strong>Persona:</strong> {agent.persona || "—"}</p>
                <p style={{ margin: "0 0 4px", fontSize: ".85rem", color: "var(--muted)" }}><strong>Tom:</strong> {agent.tone || "—"}</p>
                <p style={{ margin: "0 0 12px", fontSize: ".85rem", color: "var(--muted)" }}><strong>Status:</strong> {agent.status}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/admin/${agent.id}`} className="button" style={{ flex: 1, textAlign: "center" }}>Abrir treinamento</Link>
                <button type="button" onClick={() => excluirAgente(agent.id, agent.name)} disabled={deleting === agent.id} className="ghost" style={{ color: "#ff6b6b", borderColor: "#ff6b6b" }} title="Excluir agente">
                  {deleting === agent.id ? "..." : "🗑"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
