"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Agente = { id: string; name: string };

export default function SettingsPage() {
  const router = useRouter();
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [agenteId, setAgenteId] = useState("");
  const [salvo, setSalvo] = useState(false);

  useEffect(() => { const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1]; if (!token) router.push("/login"); }, [router]);

  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(d => { setAgentes(d.agents ?? []); setAgenteId(d.agents?.[0]?.id ?? ""); });
  }, []);

  async function salvar() {
    const res = await fetch("/api/settings/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agenteId }) });
    if (res.ok) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    }
  }

  return (
    <main style={{ padding: "32px 24px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Configurações</p>
          <h1 style={{ margin: "4px 0 8px" }}>WhatsApp</h1>
          <p className="lead">Escolha o agente que vai atender via WhatsApp.</p>
        </div>
        <Link href="/admin" className="button ghost">Voltar</Link>
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 16px" }}>Agente padrão</h2>
        <label style={{ color: "var(--muted)", display: "block", marginBottom: 8 }}>Selecione o agente que responde no WhatsApp:</label>
        <select value={agenteId} onChange={(e) => setAgenteId(e.target.value)} style={{ width: "100%", marginBottom: 16 }}>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={salvar} style={{ width: "100%" }}>Salvar configuração</button>
        {salvo && <p style={{ color: "var(--accent)", marginTop: 12, textAlign: "center" }}>Configuração salva!</p>}
      </section>

      <section className="card">
        <h2 style={{ margin: "0 0 16px" }}>Conexão</h2>
        <p style={{ color: "var(--muted)" }}>A conexão direta com QR Code (Baileys) e a API oficial do WhatsApp (Meta) serão adicionadas em uma etapa separada. Por enquanto, defina acima qual agente será usado quando a integração for ativada.</p>
      </section>
    </main>
  );
}
