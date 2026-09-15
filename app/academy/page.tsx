"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import MicButton from "../components/MicButton";

type Modulo = { id: number; titulo: string; descricao: string; objetivo: string; emoji: string; dificuldade: string };
type Perfil = { id: number; nome: string; negocio: string; emoji: string; dor: string; estilo: string };
type Imovel = { id: string; reference: string; title: string; sale_price: number; address?: string; neighborhood?: string; bedrooms?: number; suites?: number; bathrooms?: number; parking_spaces?: number; area?: number; url?: string; payload?: { photos?: string[]; description?: string; unit_features?: string; building_features?: string } };
type Msg = { role: "user" | "assistant"; content: string };
type Avaliacao = { nota_final: number; pontos_fortes?: string[]; pontos_melhora?: string[]; acoes_sugeridas?: string[] } & Record<string, string | number | string[] | undefined>;

function PropertyCard({ i, onClick }: { i: Imovel; onClick: () => void }) {
  const [idx, setIdx] = useState(0);
  const photos = i.payload?.photos ?? [];
  const hasMany = photos.length > 1;
  const prev = () => setIdx((idx - 1 + photos.length) % photos.length);
  const next = () => setIdx((idx + 1) % photos.length);
  return (
    <div className="card" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", border: "1px solid var(--line)", width: "100%", position: "relative" }}>
      <div style={{ position: "relative" }}>
        {photos[idx] ? <img src={photos[idx]} alt={i.title} style={{ width: "100%", height: 160, borderRadius: 12, objectFit: "cover" }} /> : <div style={{ height: 160, borderRadius: 12, background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Sem foto</div>}
        {hasMany && (
          <>
            <button onClick={(e) => { e.stopPropagation(); prev(); }} className="ghost" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", padding: "8px 12px", background: "rgba(0,0,0,.5)", borderRadius: "50%" }}>‹</button>
            <button onClick={(e) => { e.stopPropagation(); next(); }} className="ghost" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", padding: "8px 12px", background: "rgba(0,0,0,.5)", borderRadius: "50%" }}>›</button>
            <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.6)", padding: "2px 8px", borderRadius: 8, fontSize: ".75rem" }}>{idx + 1}/{photos.length}</span>
          </>
        )}
      </div>
      <h3 style={{ margin: "0 0 4px" }}>{i.title}</h3>
      <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>{i.neighborhood || i.address} • Ref: {i.reference}</p>
      <p style={{ fontWeight: 700, color: "var(--accent)", margin: 0 }}>R$ {i.sale_price?.toLocaleString("pt-BR") || "—"}</p>
      <p style={{ fontSize: ".8rem", color: "var(--muted)" }}>{i.bedrooms ? `${i.bedrooms} quartos` : "—"} • {i.bathrooms ? `${i.bathrooms} banh` : "—"} • {i.parking_spaces ? `${i.parking_spaces} vagas` : "—"} • {i.area ? `${i.area}m²` : "—"}</p>
    </div>
  );
}

type Aba = "home" | "roleplay" | "produtos" | "ligar" | "historico";

export default function AcademyPage() {
  return (
    <ConversationProvider>
      <AcademyInner />
    </ConversationProvider>
  );
}

function AcademyInner() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("home");
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [selecionado, setSelecionado] = useState<Imovel | null>(null);
  const [selectedFoto, setSelectedFoto] = useState(0);
  const [busca, setBusca] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bairro, setBairro] = useState("");
  const [moduloId, setModuloId] = useState<number | null>(null);
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Avaliacao | null>(null);
  const [erro, setErro] = useState("");
  const [sessaoAtiva, setSessaoAtiva] = useState(false);
  const [inicio, setInicio] = useState<number>(0);
  const [duracao, setDuracao] = useState(0);
  const [sessaoId, setSessaoId] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [historico, setHistorico] = useState<any[]>([]);
  const [chamando, setChamando] = useState(false);
  const [criterio, setCriterio] = useState<number | null>(null);
  const [callErro, setCallErro] = useState("");
  const convoId = useRef<string | null>(null);
  const elAgentId = useRef<string | null>(null);
  const sessaoIdRef = useRef<number | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const conversation = useConversation({
    onError: (e) => {
      setCallErro(typeof e === "string" ? e : "Erro na conexão de voz. Verifique a permissão do microfone.");
      setChamando(false);
      // Se a chamada nunca conectou, remove o agente temporário criado no ElevenLabs
      if (!convoId.current && elAgentId.current && sessaoIdRef.current) {
        fetch("/api/roleplay/call/finish", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessaoIdRef.current, elAgentId: elAgentId.current }) }).catch(() => {});
        elAgentId.current = null;
        setSessaoAtiva(false);
      }
    },
    onMessage: ({ message, source }) => {
      if (message?.trim()) setMsgs((m) => [...m, { role: source === "user" ? "user" : "assistant", content: message.trim() }]);
    },
    onConversationMetadata: (meta) => { convoId.current = meta?.conversation_id ?? convoId.current; },
    onDisconnect: () => setChamando(false),
  });

  useEffect(() => { const token = document.cookie.match(/sb-access-token=([^;]+)/)?.[1]; if (!token) router.push("/login"); }, [router]);

  const carregarImoveis = useCallback(() => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (bairro) params.set("neighborhood", bairro);
    fetch(`/api/academy/properties?${params}`, { credentials: "include" }).then(r => r.json()).then(d => setImoveis(d.properties ?? [])).catch(() => setImoveis([]));
  }, [busca, minPrice, maxPrice, bairro]);

  const carregarHistorico = useCallback(() => fetch("/api/roleplay/history", { credentials: "include" }).then(r => r.json()).then(d => setHistorico(d.sessions ?? [])).catch(() => setHistorico([])), []);

  useEffect(() => {
    fetch("/api/academy/modules", { credentials: "include" }).then(r => r.json()).then(d => { setModulos(d.modules ?? []); setModuloId(d.modules?.[0]?.id ?? null); }).catch(() => setModulos([]));
    fetch("/api/academy/profiles", { credentials: "include" }).then(r => r.json()).then(d => { setPerfis(d.profiles ?? []); setPerfilId(d.profiles?.[0]?.id ?? null); }).catch(() => setPerfis([]));
    carregarImoveis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (aba === "historico") carregarHistorico(); }, [aba, carregarHistorico]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (sessaoAtiva) { timer.current = setInterval(() => setDuracao(Math.floor((Date.now() - inicio) / 1000)), 1000); } else if (timer.current) { clearInterval(timer.current); } return () => { if (timer.current) clearInterval(timer.current); }; }, [sessaoAtiva, inicio]);

  const iniciar = async (modoLigacao = false) => {
    if (!moduloId || !perfilId) { setErro("Selecione um módulo e um perfil para começar."); return; }
    setErro("");
    setMsgs([]); setFeedback(null); setSessaoAtiva(true); setInicio(Date.now()); setDuracao(0); setAba(modoLigacao ? "ligar" : "roleplay"); setChamando(modoLigacao); setCallErro(""); setLoading(true);
    try {
      const res = await fetch(modoLigacao ? "/api/roleplay/call/start" : "/api/roleplay/start", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduloId, perfilId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSessaoAtiva(false); setChamando(false); setAba("home"); setLoading(false); setErro(data.error || "Erro ao iniciar roleplay"); return; }
      setSessaoId(data.sessionId);
      sessaoIdRef.current = data.sessionId;
      setMsgs([{ role: "assistant", content: data.message }]);
      if (modoLigacao) {
        convoId.current = null;
        elAgentId.current = data.elAgentId ?? null;
        conversation.startSession({ signedUrl: data.signedUrl, connectionType: "websocket", dynamicVariables: data.dynamicVariables });
      }
    } catch {
      setSessaoAtiva(false); setChamando(false); setAba("home"); setErro("Erro de conexão ao iniciar roleplay");
    }
    setLoading(false);
  };

  const encerrar = async () => {
    if (!sessaoId) return;
    setLoading(true);
    if (convoId.current || elAgentId.current) {
      const cid = convoId.current ?? conversation.getId();
      try { conversation.endSession(); } catch { /* já desconectado */ }
      await fetch("/api/roleplay/call/finish", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessaoId, conversationId: cid, elAgentId: elAgentId.current }) }).catch(() => {});
      convoId.current = null; elAgentId.current = null;
    } else {
      await fetch("/api/roleplay/chat", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessaoId, message: "ENCERRAR TREINO" }) });
    }
    const evalRes = await fetch("/api/roleplay/evaluate", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessaoId, duracao }) });
    const evalData = await evalRes.json().catch(() => ({}));
    if (evalData.avaliacao) setFeedback(evalData.avaliacao);
    else setErro(evalData.error || "Não foi possível gerar a avaliação");
    setSessaoAtiva(false); setChamando(false); setAba("historico");
    setLoading(false);
    carregarHistorico();
  };

  const enviar = async () => {
    if (!input.trim() || loading || !sessaoId) return;
    const texto = input.trim(); setInput("");
    const novas = [...msgs, { role: "user" as const, content: texto }];
    setMsgs(novas); setLoading(true);
    if (texto.toUpperCase().includes("ENCERRAR TREINO")) {
      await encerrar();
      return;
    }
    const res = await fetch("/api/roleplay/chat", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessaoId, message: texto }) });
    const data = await res.json().catch(() => ({}));
    if (data.message) setMsgs(prev => [...prev, { role: "assistant", content: data.message }]);
    else if (data.error) setMsgs(prev => [...prev, { role: "assistant", content: `⚠ ${data.error}` }]);
    setLoading(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const difColor = (d: string): React.CSSProperties => d === "Iniciante" ? { background: "#dcfce7", color: "#15803d" } : d === "Médio" ? { background: "#fef9c3", color: "#a16207" } : { background: "#fee2e2", color: "#b91c1c" };
  const notaColor = (n: number) => n >= 9 ? { color: "#16a34a", bg: "#dcfce7" } : n >= 7 ? { color: "#ca8a04", bg: "#fef9c3" } : { color: "#dc2626", bg: "#fee2e2" };

  return (
    <div style={{ minHeight: "calc(100vh - 73px)", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(aba === "roleplay" || aba === "produtos") && <button className="ghost" onClick={() => setAba("home")} style={{ padding: "8px 10px" }}>←</button>}
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Academia de Vendas FQ</h1>
          <p style={{ color: "var(--muted)", fontSize: ".8rem" }}>Treinamento com IA</p>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          {["home", "produtos", "ligar", "historico"].map(a => <button key={a} onClick={() => setAba(a as Aba)} className={aba === a ? "" : "ghost"} style={{ textTransform: "capitalize" }}>{a === "ligar" ? "📞 Ligar" : a === "historico" ? "📊 Histórico" : a}</button>)}
        </nav>
      </header>

      {aba === "home" && (
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {modulos.map(m => (
              <button key={m.id} onClick={() => setModuloId(m.id)} className="card" style={{ textAlign: "left", borderWidth: 2, borderColor: moduloId === m.id ? "var(--accent)" : "var(--line)", background: moduloId === m.id ? "var(--user-bg)" : "var(--surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: "1.5rem" }}>{m.emoji}</span><span style={{ ...difColor(m.dificuldade), padding: "2px 8px", borderRadius: 99, fontSize: ".7rem" }}>{m.dificuldade}</span></div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>{m.titulo}</h3>
                <p style={{ fontSize: ".85rem", color: "var(--muted)", margin: 0 }}>{m.descricao}</p>
                <p style={{ fontSize: ".75rem", color: "var(--accent)", marginTop: 8 }}>{m.objetivo}</p>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 24 }}>
            <div className="card">
              <h3 style={{ margin: "0 0 12px" }}>Perfil do Cliente</h3>
              {perfis.map(p => (
                <button key={p.id} onClick={() => setPerfilId(p.id)} style={{ width: "100%", textAlign: "left", padding: 10, borderRadius: 12, marginBottom: 8, border: "1px solid", borderColor: perfilId === p.id ? "var(--accent)" : "var(--line)", background: perfilId === p.id ? "var(--user-bg)" : "var(--surface)", color: "var(--text)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.2rem" }}>{p.emoji}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: ".9rem" }}>{p.nome}</p>
                      <p style={{ margin: 0, fontSize: ".75rem", color: "var(--muted)" }}>{p.negocio}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>{modulos.find(m => m.id === moduloId)?.titulo} com {perfis.find(p => p.id === perfilId)?.nome}</p>
              <button onClick={() => iniciar(false)} disabled={loading} style={{ marginTop: 16, padding: "14px 32px", borderRadius: 50, fontSize: "1.1rem" }}>▶ Iniciar Roleplay</button>
              <button onClick={() => iniciar(true)} disabled={loading} className="ghost" style={{ marginTop: 12 }}>📞 Iniciar ligação (simulada)</button>
              {modulos.length === 0 && <p style={{ color: "var(--muted)", fontSize: ".8rem", marginTop: 12 }}>Carregando módulos...</p>}
              {erro && <p style={{ color: "#ff6b6b", fontSize: ".85rem", marginTop: 12 }}>{erro}</p>}
            </div>
          </div>
        </main>
      )}

      {aba === "roleplay" && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>{modulos.find(m => m.id === moduloId)?.titulo} — {perfis.find(p => p.id === perfilId)?.nome}</span>
            <span style={{ color: "var(--muted)" }}>{fmt(duracao)}</span>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "70%", padding: 12, borderRadius: 16, background: m.role === "user" ? "var(--user-bg)" : "var(--assistant-bg)", border: "1px solid var(--line)" }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
                </div>
              </div>
            ))}
            {loading && <p style={{ color: "var(--muted)" }}>Cliente está digitando...</p>}
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); enviar(); }} style={{ padding: 16, borderTop: "1px solid var(--line)", background: "var(--panel)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite sua mensagem..." style={{ flex: 1 }} />
              <MicButton onText={(t) => setInput((prev) => (prev ? prev + " " : "") + t)} title="Falar mensagem" />
            </div>
            <p style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: 8 }}>Para encerrar, digite <strong>ENCERRAR TREINO</strong>.</p>
          </form>
        </main>
      )}

      {aba === "produtos" && (
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <h2>Catálogo de Apartamentos</h2>
          <p className="lead">Estes apartamentos são usados no roleplay de vendas. Total: {imoveis.length}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "16px 0" }}>
            <input placeholder="Buscar por nome, bairro ou ref" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={carregarImoveis} onKeyDown={(e) => e.key === "Enter" && carregarImoveis()} />
            <input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} onBlur={carregarImoveis} onKeyDown={(e) => e.key === "Enter" && carregarImoveis()} />
            <input placeholder="Preço mínimo" type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onBlur={carregarImoveis} />
            <input placeholder="Preço máximo" type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onBlur={carregarImoveis} />
            <button onClick={carregarImoveis}>Buscar</button>
            <button onClick={() => { setBusca(""); setBairro(""); setMinPrice(""); setMaxPrice(""); carregarImoveis(); }} className="ghost">Limpar</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 16, marginTop: 16 }}>
            {imoveis.map(i => <PropertyCard key={i.id} i={i} onClick={() => { setSelecionado(i); setSelectedFoto(0); }} />)}
          </div>

          {selecionado && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
              <div className="card" style={{ width: 700, maxHeight: "90vh", overflow: "auto", position: "relative" }}>
                <button onClick={() => setSelecionado(null)} className="ghost" style={{ position: "absolute", top: 16, right: 16 }}>✕</button>
                {selecionado.payload?.photos?.[selectedFoto] ? <img src={selecionado.payload.photos[selectedFoto]} alt={selecionado.title} style={{ width: "100%", height: 300, borderRadius: 12, objectFit: "cover" }} /> : <div style={{ height: 240, borderRadius: 12, background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Sem foto</div>}
                {selecionado.payload?.photos && selecionado.payload.photos.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, overflow: "auto" }}>
                    {selecionado.payload.photos.map((url, i) => (
                      <img key={i} src={url} alt="" onClick={() => setSelectedFoto(i)} style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: i === selectedFoto ? "2px solid var(--accent)" : "2px solid transparent", opacity: i === selectedFoto ? 1 : 0.6 }} />
                    ))}
                  </div>
                )}
                <h2 style={{ margin: "16px 0 8px" }}>{selecionado.title}</h2>
                <p style={{ color: "var(--muted)" }}>{selecionado.neighborhood} — {selecionado.address}</p>
                <p style={{ color: "var(--accent)", fontSize: "1.5rem", fontWeight: 700, margin: "12px 0" }}>R$ {selecionado.sale_price?.toLocaleString("pt-BR") || "—"}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, margin: "16px 0" }}>
                  <div><strong>Código</strong><p>{selecionado.reference}</p></div>
                  <div><strong>Quartos</strong><p>{selecionado.bedrooms}</p></div>
                  <div><strong>Suítes</strong><p>{selecionado.suites}</p></div>
                  <div><strong>Banheiros</strong><p>{selecionado.bathrooms}</p></div>
                  <div><strong>Vagas</strong><p>{selecionado.parking_spaces}</p></div>
                  <div><strong>Área</strong><p>{selecionado.area ? `${selecionado.area} m²` : "—"}</p></div>
                </div>
                <p style={{ color: "var(--muted)", margin: "16px 0" }}>{selecionado.payload?.description}</p>
                {selecionado.payload?.unit_features && <p style={{ color: "var(--muted)", margin: "8px 0" }}><strong>Unidade:</strong> {selecionado.payload.unit_features}</p>}
                {selecionado.payload?.building_features && <p style={{ color: "var(--muted)", margin: "8px 0" }}><strong>Empreendimento:</strong> {selecionado.payload.building_features}</p>}
                <a href={selecionado.url} target="_blank" rel="noreferrer" className="button ghost">Ver anúncio no site</a>
              </div>
            </div>
          )}
        </main>
      )}

      {aba === "ligar" && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>{modulos.find(m => m.id === moduloId)?.titulo} — {perfis.find(p => p.id === perfilId)?.nome}</span>
            <span style={{ color: "var(--muted)" }}>
              {conversation.status === "connected" ? (conversation.isSpeaking ? "� Cliente falando..." : "🎙️ Ouvindo você...") : chamando ? "📞 Conectando..." : "Pronto para ligar"}
            </span>
          </div>
          <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column" }}>
            {!sessaoAtiva ? (
              <div className="card" style={{ textAlign: "center" }}>
                <h2>Modo Ligação</h2>
                <p style={{ color: "var(--muted)" }}>Selecione um módulo e um perfil na aba Home e clique abaixo para simular uma ligação por voz. O navegador vai pedir permissão de microfone.</p>
                <button onClick={() => iniciar(true)} style={{ marginTop: 16 }}>📞 Iniciar ligação</button>
              </div>
            ) : (
              <>
                <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                  <p style={{ fontSize: "1.5rem", margin: 0 }}>📞</p>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{perfis.find(p => p.id === perfilId)?.nome}</p>
                    <p style={{ margin: 0, fontSize: ".85rem", color: "var(--muted)" }}>{Math.floor(duracao / 60)}:{String(duracao % 60).padStart(2, "0")}</p>
                  </div>
                  <button onClick={encerrar} className="ghost" disabled={loading} style={{ background: "var(--danger)", color: "white" }}>{loading ? "Avaliando..." : "Encerrar"}</button>
                </div>
                {callErro && <p style={{ color: "var(--danger)" }}>{callErro}</p>}
                <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {msgs.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "75%", padding: "8px 12px", borderRadius: 12, background: m.role === "user" ? "var(--accent)" : "var(--panel)", fontSize: ".9rem" }}>
                      {m.content}
                    </div>
                  ))}
                  <div ref={bottom} />
                </div>
              </>
            )}
          </div>
        </main>
      )}

      {aba === "historico" && (
        <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2>Histórico de treinamentos</h2>
            <button onClick={carregarHistorico}>Atualizar</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {historico.map((h) => (
              <div key={h.id} className="card" onClick={() => setCriterio(criterio === h.id ? null : h.id)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{h.feedback?.modo === "ligacao" ? "📞" : "💬"} {h.training_modules?.titulo || "—"}</h3>
                    <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
                      {h.training_profiles?.nome || "—"} • {new Date(h.created_at).toLocaleDateString("pt-BR")} às {new Date(h.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {h.duracao_segundos > 0 ? ` • ⏱ ${fmt(h.duracao_segundos)}` : ""}
                    </p>
                  </div>
                  <p style={{ color: "var(--accent)", fontSize: "1.5rem", fontWeight: 700 }}>{h.nota ?? "—"}</p>
                </div>
                {criterio === h.id && h.feedback && (
                  <div style={{ marginTop: 16, padding: 12, background: "var(--panel)", borderRadius: 12 }}>
                    <p><strong>Nota final:</strong> {h.feedback.nota_final}</p>
                    {["abertura", "qualificacao", "apresentacao", "objecoes", "fechamento", "linguagem", "empatia"].map((c) => (
                      <div key={c} style={{ margin: "8px 0" }}>
                        <strong>{c}</strong>: {h.feedback[`${c}_nota`]} — {h.feedback[`${c}_feedback`]}
                      </div>
                    ))}
                    <p><strong>Pontos fortes:</strong> {h.feedback.pontos_fortes?.join(", ")}</p>
                    <p><strong>Pontos de melhoria:</strong> {h.feedback.pontos_melhora?.join(", ")}</p>
                    <p><strong>Ações sugeridas:</strong> {h.feedback.acoes_sugeridas?.join(", ")}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      )}

      {feedback && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="card" style={{ width: 500, maxHeight: "80vh", overflow: "auto" }}>
            <h2>Feedback da IA</h2>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, padding: "8px 16px", borderRadius: 12, display: "inline-block", background: notaColor(feedback.nota_final).bg, color: notaColor(feedback.nota_final).color }}>Nota: {feedback.nota_final}</p>
            {["abertura", "qualificacao", "apresentacao", "objecoes", "fechamento", "linguagem", "empatia"].map((c) => (
              <div key={c} style={{ margin: "8px 0", fontSize: ".9rem" }}>
                <strong style={{ textTransform: "capitalize" }}>{c}</strong>: {feedback[`${c}_nota`]} — <span style={{ color: "var(--muted)" }}>{feedback[`${c}_feedback`]}</span>
              </div>
            ))}
            <h4>Pontos fortes</h4>
            <ul>{feedback.pontos_fortes?.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
            <h4>Pontos de melhoria</h4>
            <ul>{feedback.pontos_melhora?.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
            {feedback.acoes_sugeridas && feedback.acoes_sugeridas.length > 0 && (
              <>
                <h4>Ações sugeridas</h4>
                <ul>{feedback.acoes_sugeridas.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
              </>
            )}
            <button onClick={() => setFeedback(null)} style={{ marginTop: 16 }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
