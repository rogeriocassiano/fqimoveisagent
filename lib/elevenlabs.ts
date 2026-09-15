const API = "https://api.elevenlabs.io/v1";
const KEY = () => process.env.ELEVENLABS_API_KEY ?? "";
const VOICE = () => process.env.ELEVENLABS_VOICE_ID || "CwhRBWXzGAHq8TQ4Fs17"; // Roger (multilingual)

function headers() {
  if (!KEY()) throw new Error("ELEVENLABS_API_KEY não configurada");
  return { "xi-api-key": KEY(), "Content-Type": "application/json" };
}

export async function createCallAgent(name: string, prompt: string, firstMessage: string) {
  const res = await fetch(`${API}/convai/agents/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name,
      conversation_config: {
        agent: {
          prompt: { prompt, llm: "gemini-2.0-flash" },
          first_message: firstMessage,
          language: "pt",
        },
        tts: { voice_id: VOICE(), model_id: "eleven_flash_v2_5" },
      },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs createAgent: ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()).agent_id as string;
}

export async function getSignedUrl(agentId: string) {
  const res = await fetch(`${API}/convai/conversation/get_signed_url?agent_id=${agentId}`, { headers: headers() });
  if (!res.ok) throw new Error(`ElevenLabs signedUrl: ${res.status}`);
  return (await res.json()).signed_url as string;
}

export type CallTranscriptEntry = { role: "agent" | "user"; message: string; time_in_call_secs?: number };

export async function getConversation(conversationId: string) {
  const res = await fetch(`${API}/convai/conversations/${conversationId}`, { headers: headers() });
  if (!res.ok) throw new Error(`ElevenLabs getConversation: ${res.status}`);
  return (await res.json()) as {
    status: string;
    transcript?: CallTranscriptEntry[];
    metadata?: { call_duration_secs?: number };
  };
}

export async function deleteCallAgent(agentId: string) {
  await fetch(`${API}/convai/agents/${agentId}`, { method: "DELETE", headers: headers() }).catch(() => {});
}

// O módulo entra via dynamic variables ({{modulo_titulo}}/{{modulo_objetivo}})
// no startSession — assim o mesmo agente serve para todos os módulos.
export function buildVoicePrompt(perfil: Record<string, string | number | null>) {
  return `Você é ${perfil.nome}, um CLIENTE em uma ligação de vendas com um corretor da FQ Imóveis.

PERSONAGEM: ${perfil.nome} (${perfil.negocio})
PERFIL: ${perfil.estilo}
DOR PRINCIPAL: ${perfil.dor}
${perfil.prompt_instrucoes ? `INSTRUÇÕES EXTRAS DO PERSONAGEM: ${perfil.prompt_instrucoes}` : ""}

CONTEXTO DO TREINO DE HOJE: "{{modulo_titulo}}" — {{modulo_objetivo}}

REGRAS:
1. Fale SEMPRE em português brasileiro, como em uma ligação telefônica real — frases curtas, naturais, com hesitações ocasionais.
2. Nunca saia do personagem. Você é o cliente; o corretor é quem liga.
3. Seja difícil de convencer: coloque objeções genuínas da sua persona.
4. Se o corretor fizer boas perguntas de qualificação, responda com detalhes.
5. Se os argumentos forem fracos, mostre resistência; se forem fortes, demonstre interesse gradual.
6. Não encerre a ligação por conta própria — deixe o corretor conduzir.`;
}

export function firstMessageFor(perfil: Record<string, string | number | null>) {
  return `Oi, sou o ${perfil.nome}. Vi que vocês têm apartamentos na planta. Tô dando uma olhada, mas tô meio inseguro ainda.`;
}
