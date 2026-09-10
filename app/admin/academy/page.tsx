"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Modulo = { id: number; ordem: number; ativo: boolean; titulo: string; descricao: string; objetivo: string; emoji: string; dificuldade: string; prompt_instrucoes: string };
type Perfil = { id: number; ordem: number; ativo: boolean; nome: string; negocio: string; emoji: string; dor: string; estilo: string; prompt_instrucoes: string };
type Aba = "modulos" | "perfis";

export default function AcademyAdminPage() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("modulos");
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [editando, setEditando] = useState<Modulo | Perfil | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => { const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1]; if (!token) router.push("/login"); }, [router]);

  useEffect(() => {
    fetch("/api/academy/modules").then(r => r.json()).then(d => setModulos(d.modules ?? []));
    fetch("/api/academy/profiles").then(r => r.json()).then(d => setPerfis(d.profiles ?? []));
  }, []);

  async function salvarModulo(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || !("titulo" in editando)) return;
    const body = editando;
    const url = body.id ? `/api/academy/modules/${body.id}` : "/api/academy/modules";
    const method = body.id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      setModulos(prev => body.id ? prev.map(m => m.id === data.module.id ? data.module : m) : [data.module, ...prev]);
      setEditando(null);
    } else alert(data.error || "Erro");
  }

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || !("nome" in editando)) return;
    const body = editando;
    const url = body.id ? `/api/academy/profiles/${body.id}` : "/api/academy/profiles";
    const method = body.id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      setPerfis(prev => body.id ? prev.map(p => p.id === data.profile.id ? data.profile : p) : [data.profile, ...prev]);
      setEditando(null);
    } else alert(data.error || "Erro");
  }

  async function excluir(tipo: "modulo" | "perfil", id: number) {
    if (!confirm("Tem certeza?")) return;
    const url = tipo === "modulo" ? `/api/academy/modules/${id}` : `/api/academy/profiles/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      if (tipo === "modulo") setModulos(prev => prev.filter(m => m.id !== id));
      else setPerfis(prev => prev.filter(p => p.id !== id));
    }
  }

  function novoModulo() {
    setEditando({ id: 0, ordem: modulos.length, ativo: true, titulo: "", descricao: "", objetivo: "", emoji: "", dificuldade: "Médio", prompt_instrucoes: "" });
  }

  function novoPerfil() {
    setEditando({ id: 0, ordem: perfis.length, ativo: true, nome: "", negocio: "", emoji: "", dor: "", estilo: "", prompt_instrucoes: "" });
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Academy</p>
          <h1 style={{ margin: "4px 0 8px" }}>Gerenciar treinamento</h1>
          <p className="lead">Crie e ajuste módulos e perfis de clientes.</p>
        </div>
        <Link href="/admin" className="button ghost">Voltar</Link>
      </div>

      <nav style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button onClick={() => { setAba("modulos"); setEditando(null); }} className={aba === "modulos" ? "" : "ghost"}>Módulos</button>
        <button onClick={() => { setAba("perfis"); setEditando(null); }} className={aba === "perfis" ? "" : "ghost"}>Perfis de cliente</button>
      </nav>

      {aba === "modulos" && (
        <section>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={novoModulo}>+ Novo módulo</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {modulos.map(m => (
              <div key={m.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "1.5rem" }}>{m.emoji || "📚"}</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>{m.titulo}</h3>
                      <p style={{ color: "var(--muted)", fontSize: ".85rem", margin: "2px 0 0" }}>{m.dificuldade} {m.ativo ? "• Ativo" : "• Inativo"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setEditando(m); setAberto(null); }} className="ghost" style={{ padding: "6px 12px" }}>✏️</button>
                    <button onClick={() => excluir("modulo", m.id)} className="ghost" style={{ padding: "6px 12px" }}>🗑️</button>
                    <button onClick={() => setAberto(aberto === m.id ? null : m.id)} className="ghost" style={{ padding: "6px 12px" }}>{aberto === m.id ? "▲" : "▼"}</button>
                  </div>
                </div>
                {aberto === m.id && (
                  <div style={{ padding: 12, background: "var(--panel)", borderRadius: 12 }}>
                    <p style={{ margin: 0, color: "var(--muted)" }}><strong>Descrição:</strong> {m.descricao}</p>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)" }}><strong>Objetivo:</strong> {m.objetivo}</p>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)" }}><strong>Prompt:</strong> {m.prompt_instrucoes || "—"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {aba === "perfis" && (
        <section>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={novoPerfil}>+ Novo perfil</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {perfis.map(p => (
              <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "1.5rem" }}>{p.emoji || "👤"}</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>{p.nome}</h3>
                      <p style={{ color: "var(--muted)", fontSize: ".85rem", margin: "2px 0 0" }}>{p.negocio} {p.ativo ? "• Ativo" : "• Inativo"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setEditando(p); setAberto(null); }} className="ghost" style={{ padding: "6px 12px" }}>✏️</button>
                    <button onClick={() => excluir("perfil", p.id)} className="ghost" style={{ padding: "6px 12px" }}>🗑️</button>
                    <button onClick={() => setAberto(aberto === p.id ? null : p.id)} className="ghost" style={{ padding: "6px 12px" }}>{aberto === p.id ? "▲" : "▼"}</button>
                  </div>
                </div>
                {aberto === p.id && (
                  <div style={{ padding: 12, background: "var(--panel)", borderRadius: 12 }}>
                    <p style={{ margin: 0, color: "var(--muted)" }}><strong>Dor:</strong> {p.dor}</p>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)" }}><strong>Estilo:</strong> {p.estilo}</p>
                    <p style={{ margin: "8px 0 0", color: "var(--muted)" }}><strong>Prompt:</strong> {p.prompt_instrucoes || "—"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div className="card" style={{ width: 600, maxHeight: "90vh", overflow: "auto", position: "relative" }}>
            <button onClick={() => setEditando(null)} className="ghost" style={{ position: "absolute", top: 16, right: 16 }}>✕</button>
            <h2>{"titulo" in editando ? (editando.id ? "Editar módulo" : "Novo módulo") : (editando.id ? "Editar perfil" : "Novo perfil")}</h2>
            <form onSubmit={"titulo" in editando ? salvarModulo : salvarPerfil} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {("titulo" in editando) ? (
                <>
                  <input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Título" required />
                  <textarea value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} placeholder="Descrição" rows={3} />
                  <input value={editando.objetivo} onChange={(e) => setEditando({ ...editando, objetivo: e.target.value })} placeholder="Objetivo" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <input value={editando.emoji} onChange={(e) => setEditando({ ...editando, emoji: e.target.value })} placeholder="Emoji" />
                    <select value={editando.dificuldade} onChange={(e) => setEditando({ ...editando, dificuldade: e.target.value })}>
                      <option>Iniciante</option>
                      <option>Médio</option>
                      <option>Avançado</option>
                    </select>
                    <input type="number" value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} placeholder="Ordem" />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
                    <input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativo
                  </label>
                  <textarea value={editando.prompt_instrucoes} onChange={(e) => setEditando({ ...editando, prompt_instrucoes: e.target.value })} placeholder="Instruções de prompt para a IA" rows={4} />
                </>
              ) : (
                <>
                  <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Nome" required />
                  <input value={editando.negocio} onChange={(e) => setEditando({ ...editando, negocio: e.target.value })} placeholder="Negócio/perfil" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                    <input value={editando.emoji} onChange={(e) => setEditando({ ...editando, emoji: e.target.value })} placeholder="Emoji" />
                    <input type="number" value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} placeholder="Ordem" />
                  </div>
                  <input value={editando.dor} onChange={(e) => setEditando({ ...editando, dor: e.target.value })} placeholder="Dor" />
                  <input value={editando.estilo} onChange={(e) => setEditando({ ...editando, estilo: e.target.value })} placeholder="Estilo de comunicação" />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
                    <input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativo
                  </label>
                  <textarea value={editando.prompt_instrucoes} onChange={(e) => setEditando({ ...editando, prompt_instrucoes: e.target.value })} placeholder="Instruções de prompt para a IA" rows={4} />
                </>
              )}
              <button type="submit">Salvar</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
