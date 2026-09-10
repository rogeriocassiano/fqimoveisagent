"use client";

import { useEffect, useRef, useState } from "react";
import "@/lib/speech";
import type { SpeechRecognitionLike } from "@/lib/speech";

const sugestoes = [
  { icon: "🧨", label: "Corrigir uma mensagem para cliente" },
  { icon: "✉️", label: "Escrever um email de follow-up" },
  { icon: "🛡️", label: "Responder objeção de preço" },
  { icon: "🏢", label: "Info sobre produto do catálogo" },
];

type Aba = "chat" | "reuniao";

export default function FloatingAssistant() {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("chat");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [transcricao, setTranscricao] = useState("");
  const [dicas, setDicas] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    fetch("/api/agents").then(r => r.json()).then(d => setAgentId(d.agents?.[0]?.id ?? null));
  }, []);

  async function enviar(texto: string) {
    if (!texto.trim() || !agentId) return;
    setMsgs(prev => [...prev, { role: "user", text: texto }]);
    setInput("");
    setLoading(true);
    const res = await fetch(`/api/agents/${agentId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: texto }) });
    const data = await res.json();
    setMsgs(prev => [...prev, { role: "assistant", text: data.answer || data.error || "Não entendi." }]);
    setLoading(false);
  }

  function iniciarEscuta() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Seu navegador não suporta reconhecimento de voz"); return; }
    const rec = new SR();
    rec.lang = "pt-BR"; rec.interimResults = true;
    rec.onresult = (ev) => {
      const final = ev.results.filter(r => r[0].isFinal !== false).map(r => r[0].transcript).join(" ");
      const interim = ev.results.filter(r => r[0].isFinal === false).map(r => r[0].transcript).join(" ");
      setTranscricao(final + (interim ? " " + interim : ""));
    };
    rec.onend = () => { if (ouvindo) rec.start(); };
    rec.start();
    recRef.current = rec;
    setOuvindo(true);
    setDicas([]);
  }

  function pararEscuta() {
    setOuvindo(false);
    recRef.current?.stop();
    if (transcricao && agentId) gerarDicas(transcricao);
  }

  async function gerarDicas(texto: string) {
    setLoading(true);
    const prompt = `Você é um assistente de vendas experiente. Durante uma reunião/call entre corretor e cliente, o corretor falou isso:\n\n${texto}\n\nDê 3 a 5 dicas objetivas de próximos passos, objeções a vencer e sugestões de frases para o corretor. Responda em português, curto.`;
    const res = await fetch(`/api/agents/${agentId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: prompt }) });
    const data = await res.json();
    setDicas((data.answer || "").split("\n").filter((l: string) => l.trim()));
    setLoading(false);
  }

  return (
    <>
      <button onClick={() => setAberto(!aberto)} style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, background: "var(--accent)", color: "#091d2e", border: 0, boxShadow: "0 4px 20px rgba(0,0,0,.3)", zIndex: 100, fontSize: "1.5rem", cursor: "pointer" }}>✨</button>
      {aberto && (
        <div style={{ position: "fixed", bottom: 90, right: 24, width: 380, maxHeight: "80vh", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 8px 40px rgba(0,0,0,.4)", zIndex: 100, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--accent)", color: "#091d2e" }}>
            <span style={{ fontWeight: 700 }}>Assistente IA</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAba("chat")} className={aba === "chat" ? "" : "ghost"} style={{ padding: "4px 10px" }}>💬 Chat</button>
              <button onClick={() => setAba("reuniao")} className={aba === "reuniao" ? "" : "ghost"} style={{ padding: "4px 10px" }}>🎤 Reunião</button>
              <button onClick={() => setAberto(false)} className="ghost" style={{ padding: "4px 8px" }}>✕</button>
            </div>
          </div>

          {aba === "chat" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 300 }}>
                {msgs.length === 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <p style={{ color: "var(--muted)", textAlign: "center", marginBottom: 8 }}>Como posso te ajudar?</p>
                    {sugestoes.map((s, i) => (
                      <button key={i} onClick={() => enviar(s.label)} className="ghost" style={{ textAlign: "left", padding: 10, border: "1px solid var(--line)" }}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    <div style={{ maxWidth: "80%", padding: 10, borderRadius: 12, background: m.role === "user" ? "var(--user-bg)" : "var(--assistant-bg)", border: "1px solid var(--line)" }}>
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".85rem" }}>{m.text}</p>
                    </div>
                  </div>
                ))}
                {loading && <p style={{ color: "var(--muted)", fontSize: ".8rem" }}>Pensando...</p>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); enviar(input); }} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)" }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte ou cole uma mensagem..." style={{ flex: 1 }} />
                <button type="submit" disabled={loading || !input.trim()}>➤</button>
              </form>
            </div>
          )}

          {aba === "reuniao" && (
            <div style={{ flex: 1, padding: 16, minHeight: 300, display: "flex", flexDirection: "column" }}>
              <p style={{ color: "var(--muted)", fontSize: ".85rem", textAlign: "center", marginBottom: 12 }}>Ative o microfone durante uma reunião ou call. A IA vai ouvir e dar sugestões em tempo real.</p>
              <button onClick={ouvindo ? pararEscuta : iniciarEscuta} style={{ background: ouvindo ? "var(--danger)" : "#22c55e", color: "white", padding: "12px 24px", borderRadius: 12, alignSelf: "center" }}>
                {ouvindo ? "⏹ Parar escuta" : "🎤 Iniciar escuta"}
              </button>
              <div style={{ flex: 1, marginTop: 16, padding: 12, background: "var(--bg)", borderRadius: 12, overflow: "auto" }}>
                <p style={{ color: "var(--muted)", fontSize: ".8rem" }}>Transcrição:</p>
                <p style={{ fontSize: ".85rem", minHeight: 80 }}>{transcricao || "A transcrição aparecerá aqui..."}</p>
                {dicas.length > 0 && (
                  <>
                    <p style={{ color: "var(--accent)", fontWeight: 700, marginTop: 12, fontSize: ".85rem" }}>Dicas:</p>
                    <ul style={{ fontSize: ".85rem", paddingLeft: 18 }}>{dicas.map((d, i) => <li key={i}>{d}</li>)}</ul>
                  </>
                )}
                {loading && <p style={{ color: "var(--muted)" }}>Gerando dicas...</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
