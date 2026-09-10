import { adminDb } from "@/lib/supabase";
import { answerWithGemini } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

const PROMPT = `Você é um gestor de vendas rigoroso avaliando uma simulação de ligação de um corretor da FQ Imóveis com um cliente fictício.

Avalie a conversa do vendedor em 6 critérios, de 0 a 10, com rigor. Depois de notas parciais, calcule a nota final como média simples.

Critérios:
1. Abertura e conexão (saudação, rapport, contexto)
2. Qualificação BANT (perguntou orçamento, necessidade, prazo, autoridade?)
3. Apresentação do imóvel (conectou com a necessidade, citou características)
4. Lide com objeções (preço, prazo, localização)
5. Fechamento e próximo passo (proposta clara, ação concreta)
6. Linguagem e empatia (clareza, tom, escuta ativa)

Retorne APENAS um JSON no seguinte formato, sem explicação fora do JSON:
{
  "nota_final": number,
  "abertura_nota": number, "abertura_feedback": string,
  "qualificacao_nota": number, "qualificacao_feedback": string,
  "apresentacao_nota": number, "apresentacao_feedback": string,
  "objecoes_nota": number, "objecoes_feedback": string,
  "fechamento_nota": number, "fechamento_feedback": string,
  "linguagem_nota": number, "linguagem_feedback": string,
  "empatia_nota": number, "empatia_feedback": string,
  "pontos_fortes": string[],
  "pontos_melhora": string[],
  "acoes_sugeridas": string[]
}`;

export async function POST(req: NextRequest) {
  const db = adminDb();
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: "sessionId obrigatório" }, { status: 400 });

  const { data: session, error } = await db.from("roleplay_sessions").select("*, training_modules(titulo)").eq("id", sessionId).single();
  if (error || !session) return NextResponse.json({ error: error?.message || "Sessão não encontrada" }, { status: 404 });

  const mensagens = (session.mensagens ?? []).map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n");
  const texto = `${PROMPT}\n\nConversa:\n${mensagens}`;

  const resposta = await answerWithGemini(texto, PROMPT, "", []);
  const jsonMatch = resposta.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ error: "Avaliação inválida da IA" }, { status: 500 });

  const avaliacao = JSON.parse(jsonMatch[0]);
  const { data: saved, error: saveError } = await db.from("training_evaluations").insert({
    session_id: sessionId,
    vendedor_email: session.vendedor_email,
    modulo_titulo: session.training_modules?.titulo || "",
    ...avaliacao,
  }).select().single();

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  await db.from("roleplay_sessions").update({ nota: avaliacao.nota_final, feedback: avaliacao }).eq("id", sessionId);

  return NextResponse.json({ avaliacao: saved });
}
