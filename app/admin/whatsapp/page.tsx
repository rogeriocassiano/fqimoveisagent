"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Agent = { id: string; name: string };
type WaSession = { id: string; agent_id: string | null; phone: string | null; status: string; created_at: string; agents?: { name: string } | null };

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  connecting: { label: "Conectando...", color: "#a16207", bg: "#fef9c3" },
  qr: { label: "Aguardando QR", color: "#a16207", bg: "#fef9c3" },
  connected: { label: "Conectado", color: "#15803d", bg: "#dcfce7" },
  disconnected: { label: "Desconectado", color: "#b91c1c", bg: "#fee2e2" },
  pending: { label: "Pendente", color: "#a16207", bg: "#fef9c3" },
};

function statusStyle(s: string) {
  return STATUS_LABEL[s] ?? { label: s, color: "var(--muted)", bg: "var(--panel)" };
}

export default function WhatsAppPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<WaSession[]>([]);
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) { router.push("/login"); return; }
    fetch("/api/agents").then(r => r.json()).then(d => { setAgents(d.agents ?? []); setAgentId("all"); }).catch(() => {});
    carregar();
  }, [router]);

  useEffect(() => () => { if (polling.current) clearInterval(polling.current); }, []);

  async function carregar() {
    const res = await fetch("/api/whatsapp/sessions");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSessions(data.sessions ?? []);
  }

  function pararPolling() {
    if (polling.current) { clearInterval(polling.current); polling.current = null; }
  }

  function iniciarPolling(id: string) {
    pararPolling();
    polling.current = setInterval(async () => {
      const st = await fetch(`/api/whatsapp/sessions/${id}`).then(r => r.json()).catch(() => ({}));
      if (st.status === "connected") {
        pararPolling();
        setQr(null); setQrSession(null);
        carregar();
        return;
      }
      const q = await fetch(`/api/whatsapp/sessions/${id}/qr`).then(r => r.json()).catch(() => ({}));
      if (q.qr) setQr(q.qr);
    }, 2500);
  }

  async function conectar() {
    if (!agentId) { setErro("Selecione um agente"); return; }
    setErro(""); setLoading(true); setQr(null);
    const res = await fetch("/api/whatsapp/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setErro(data.error || "Erro ao iniciar conexão"); return; }
    const id = data.session.id;
    setQrSession(id);
    iniciarPolling(id);
    carregar();
  }

  async function desconectar(id: string) {
    if (!confirm("Desconectar este número do WhatsApp?")) return;
    await fetch(`/api/whatsapp/sessions/${id}`, { method: "DELETE" });
    if (qrSession === id) { pararPolling(); setQr(null); setQrSession(null); }
    carregar();
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p className="eyebrow">Console do diretor</p>
          <h1 style={{ margin: "4px 0 8px" }}>Conexão WhatsApp</h1>
          <p className="lead">Conecte um número via QR code e escolha qual agente responde as mensagens.</p>
        </div>
        <Link href="/admin" className="button ghost">Voltar</Link>
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 12px" }}>Conectar novo número</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ minWidth: 240 }}>
            <option value="" disabled>Selecione o agente que vai responder</option>
            <option value="all">🧠 Agente geral (todo o contexto — SR. Queiroz)</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={conectar} disabled={loading || !agentId}>{loading ? "Iniciando..." : "📱 Gerar QR Code"}</button>
        </div>
        {erro && <p style={{ color: "#ff6b6b", marginTop: 12 }}>{erro}</p>}

        {qrSession && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            {qr ? (
              <>
                <p className="lead">Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e aponte para o código:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR Code WhatsApp" style={{ width: 280, height: 280, borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 12 }} />
                <p style={{ color: "var(--muted)", fontSize: ".8rem" }}>O código se renova automaticamente. Aguardando leitura...</p>
              </>
            ) : (
              <p className="lead">Gerando QR code... aguarde alguns segundos.</p>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Números conectados</h2>
          <button onClick={carregar} className="ghost">Atualizar</button>
        </div>
        {sessions.length === 0 && <p className="lead">Nenhum número conectado ainda.</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {sessions.map((s) => {
            const st = statusStyle(s.status);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, border: "1px solid var(--line)", borderRadius: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{s.phone ? `+${s.phone}` : "Número não identificado"}</p>
                  <p style={{ margin: "4px 0 0", fontSize: ".85rem", color: "var(--muted)" }}>
                    Agente: {s.agent_id ? (s.agents?.name ?? "—") : "🧠 Geral (todo o contexto)"} • {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ padding: "4px 12px", borderRadius: 99, fontSize: ".8rem", fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                  {s.status === "qr" && <button className="ghost" onClick={() => { setQrSession(s.id); setQr(null); iniciarPolling(s.id); }}>Ver QR</button>}
                  <button className="ghost" onClick={() => desconectar(s.id)} style={{ color: "#ff6b6b" }}>Desconectar</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
