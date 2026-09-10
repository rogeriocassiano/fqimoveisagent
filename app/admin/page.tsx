"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  persona: string;
  tone: string;
  status: string;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({ name: "", persona: "", tone: "", system_prompt: "" });
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [improving, setImproving] = useState(false);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) router.push("/login");
  }, [router]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents ?? []));
  }, []);

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
          <Link href="/admin/academy" className="button ghost">Gerenciar Academy</Link>
          <Link href="/admin/properties" className="button ghost">Apartamentos</Link>
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
            <input value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} placeholder="Persona (ex: corretor especialista)" />
            <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder="Tom (ex: cordial, direto, formal)" />
          </div>

          <div style={{ position: "relative" }}>
            <textarea
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="Instrução de sistema (system prompt)"
              rows={6}
              style={{ width: "100%", fontFamily: "monospace", fontSize: ".9rem" }}
            />
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8 }}>
              <button type="button" onClick={improve} disabled={improving} className="ghost" style={{ fontSize: ".8rem" }}>{improving ? "Melhorando..." : "✨ Melhorar prompt"}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={suggest} disabled={suggesting} className="ghost">{suggesting ? "Gerando..." : "✨ Sugerir com IA"}</button>
            <button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar agente"}</button>
          </div>
        </form>
      </section>

      <section>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Agentes criados</h2>
        {agents.length === 0 && <p style={{ color: "var(--muted)" }}>Nenhum agente criado ainda.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
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
              <Link href={`/admin/${agent.id}`} className="button" style={{ width: "100%", textAlign: "center" }}>Abrir treinamento</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
