"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SpeechRecognitionLike } from "@/lib/speech";

type Agent = { id: string; name: string; persona: string };

type Message = { role: "user" | "assistant"; text: string; fileName?: string; sources?: { text: string }[] };

type Source = { id: string; title: string; status: string };

type Suggestion = string;

const SUGGESTIONS: Suggestion[] = [
  "Qual é a regra de ouro de vendas da FQ?",
  "Me ajude a preparar uma proposta para um cliente.",
  "Quais são os diferenciais da FQ Imóveis?",
  "Como qualificar um lead de alto padrão?",
];

export default function ChatPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"chat" | "context">("chat");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1];
    if (!token) router.push("/login");
  }, [router]);

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((data) => {
      setAgents(data.agents ?? []);
      if (data.agents?.[0]) setAgentId(data.agents[0].id);
    });
  }, []);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}`).then((r) => r.json()).then((data) => {
      setSources(data.agent?.sources ?? []);
    });
  }, [agentId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, tab]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Seu navegador não suporta reconhecimento de voz. Use Chrome ou anexe um áudio.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);
    recognition.onresult = (event: unknown) => {
      const ev = event as { results: { transcript: string }[][] };
      const transcript = Array.from(ev.results).map((r) => r[0].transcript).join("");
      setInput((prev) => (prev ? prev + " " : prev) + transcript);
    };
    recognition.start();
    setMediaRecorder(recognition);
  }

  function stopVoice() {
    mediaRecorder?.stop();
    setRecording(false);
    setMediaRecorder(null);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() && !file) return;
    const userText = input || (file ? `[Anexo: ${file.name}]` : "");
    setMessages([...messages, { role: "user", text: userText, fileName: file?.name }]);
    setLoading(true);
    setInput("");

    const body = new FormData();
    body.append("message", input);
    body.append("agentId", agentId);
    if (file) body.append("file", file);

    const res = await fetch("/api/chat", { method: "POST", body });
    const data = await res.json();
    setLoading(false);
    setFile(null);
    setPreview(null);
    setMessages((prev) => [...prev, { role: "assistant", text: data.answer || data.error || "Erro", sources: data.sources }]);
  }

  async function trainFromChat() {
    if (!file || !agentId) return;
    const body = new FormData();
    body.append("type", "document");
    body.append("title", `Conteúdo do chat: ${file.name}`);
    body.append("file", file);
    const res = await fetch(`/api/agents/${agentId}/sources`, { method: "POST", body });
    if (res.ok) {
      setFile(null);
      setPreview(null);
      setSources((prev) => [...prev, { id: crypto.randomUUID(), title: `Conteúdo do chat: ${file.name}`, status: "pending" }]);
      alert("Arquivo adicionado às fontes do agente. Vá ao /admin para treinar.");
    } else {
      alert("Erro ao adicionar fonte.");
    }
  }

  function suggestion(text: string) {
    setInput(text);
    setTimeout(() => send(), 50);
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 73px)", background: "var(--bg)" }}>
      <aside style={{ width: 280, borderRight: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", padding: 16 }}>
        <Link href="/admin" className="button" style={{ marginBottom: 16, textAlign: "center" }}>+ Novo agente</Link>

        <label style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 6 }}>Agente</label>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ marginBottom: 20 }}>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setTab("chat")} className={tab === "chat" ? "" : "ghost"} style={{ flex: 1 }}>Chat</button>
          <button onClick={() => setTab("context")} className={tab === "context" ? "" : "ghost"} style={{ flex: 1 }}>Contexto</button>
        </nav>

        {tab === "context" ? (
          <div style={{ flex: 1, overflow: "auto" }}>
            <h3 style={{ fontSize: ".95rem", margin: "0 0 12px" }}>Fontes treinadas</h3>
            {sources.length === 0 && <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>Nenhuma fonte ainda.</p>}
            {sources.map((s) => (
              <div key={s.id} style={{ padding: 10, borderRadius: 12, background: "var(--panel)", marginBottom: 8, border: "1px solid var(--line)", fontSize: ".85rem" }}>
                <strong>{s.title}</strong>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>Status: {s.status}</p>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "auto" }}>
            <h3 style={{ fontSize: ".95rem", margin: "0 0 12px" }}>Sugestões</h3>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => suggestion(s)} className="ghost" style={{ width: "100%", textAlign: "left", marginBottom: 8, fontSize: ".85rem" }}>{s}</button>
            ))}
          </div>
        )}
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        {messages.length === 0 && tab === "chat" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
            <Image src="/logo-fq.png" alt="FQ Imóveis" width={120} height={36} priority />
            <h1 style={{ fontSize: "2rem", margin: "24px 0 8px" }}>Como posso ajudar?</h1>
            <p className="lead" style={{ maxWidth: 500 }}>Fale com o SR. Queiroz, envie fotos, PDFs, áudios ou links. Ele aprende com o diretor de vendas para apoiar corretores e atender clientes.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 24 }}>
              {SUGGESTIONS.map((s, i) => <button key={i} onClick={() => suggestion(s)} className="ghost">{s}</button>)}
            </div>
          </div>
        ) : (
          tab === "chat" && (
            <div style={{ flex: 1, overflow: "auto", padding: "24px 15%", display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%", background: m.role === "user" ? "var(--user-bg)" : "var(--assistant-bg)", padding: 16, borderRadius: 18, border: m.role === "user" ? "1px solid #ffd8b3" : "1px solid var(--line)", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text)" }}>{m.text}</p>
                  {m.fileName && <p style={{ fontSize: ".75rem", color: "var(--muted)", margin: "6px 0 0" }}>Anexo: {m.fileName}</p>}
                </div>
              ))}
              {loading && <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>SR. Queiroz está pensando...</p>}
              <div ref={bottom} />
            </div>
          )
        )}

        {tab === "context" && (
          <div style={{ flex: 1, overflow: "auto", padding: "24px 15%" }}>
            <h2>Contexto do agente</h2>
            <p className="lead">Aqui está tudo o que o SR. Queiroz já aprendeu.</p>
            {sources.length === 0 && <p>Nenhuma fonte adicionada ainda.</p>}
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {sources.map((s) => (
                <div key={s.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>{s.title}</h3>
                    <p style={{ color: "var(--muted)", fontSize: ".85rem", margin: "4px 0 0" }}>{s.status}</p>
                  </div>
                  <span className="eyebrow">{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={send} style={{ borderTop: "1px solid var(--line)", padding: "16px 15%", background: "var(--panel)" }}>
          {preview && <Image src={preview} alt="preview" width={120} height={90} style={{ borderRadius: 8, marginBottom: 8, objectFit: "cover" }} />}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: "8px 12px" }}>
            <button type="button" className="icon ghost" onClick={() => fileRef.current?.click()} title="Anexar foto, vídeo, PDF...">📎</button>
            <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.xlsx,.xls,.csv" onChange={onFileChange} style={{ display: "none" }} />
            <button type="button" className="icon ghost" onClick={recording ? stopVoice : startVoice} title="Gravar áudio">{recording ? "⏹" : "🎤"}</button>
            {file && <button type="button" className="icon ghost" onClick={trainFromChat} title="Salvar como fonte de treinamento">📚</button>}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Mensagem SR. Queiroz..."
              rows={1}
              style={{ flex: 1, resize: "none", border: 0, background: "transparent", maxHeight: 120 }}
            />
            <button type="submit" disabled={loading || (!input.trim() && !file)} className="icon" style={{ background: "var(--accent)", color: "#fff" }}>➤</button>
          </div>
          <p style={{ fontSize: ".75rem", color: "var(--muted)", textAlign: "center", margin: "8px 0 0" }}>O SR. Queiroz pode cometer erros. Sempre confirme dados de imóveis com um corretor.</p>
        </form>
      </main>
    </div>
  );
}
