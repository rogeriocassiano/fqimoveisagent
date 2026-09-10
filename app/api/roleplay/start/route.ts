import { adminDb } from "@/lib/supabase";
import { answerWithGemini } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const db = adminDb();
  const { moduloId, perfilId, vendedorEmail } = await req.json();
  if (!moduloId || !perfilId) return NextResponse.json({ error: "Módulo e perfil são obrigatórios" }, { status: 400 });

  const { data: modulo } = await db.from("training_modules").select("*").eq("id", moduloId).single();
  const { data: perfil } = await db.from("training_profiles").select("*").eq("id", perfilId).single();
  const { data: properties } = await db.from("properties").select("*").eq("status", "available").limit(20);

  const prompt = buildSystemPrompt(modulo, perfil, properties ?? []);
  const message = await answerWithGemini("Pode começar o roleplay.", "", prompt);

  const agentRes = await db.from("agents").select("id").order("created_at", { ascending: false }).limit(1).single();
  const agentId = agentRes.data?.id ?? "00000000-0000-0000-0000-000000000000";

  const { data: session, error } = await db.from("roleplay_sessions").insert({
    agent_id: agentId,
    vendedor_email: vendedorEmail || "anonimo",
    modulo_id: moduloId,
    perfil_id: perfilId,
    mensagens: [{ role: "assistant", content: message }],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message, sessionId: session.id });
}

function buildSystemPrompt(modulo: Record<string, string | number | null>, perfil: Record<string, string | number | null>, properties: Record<string, string | number | null>[]) {
  const catalogo = properties.map(p => `- ${p.title} | Bairro: ${p.neighborhood || '-'} | Preço: R$ ${p.sale_price?.toLocaleString('pt-BR') || 'sob consulta'} | ${p.bedrooms} quartos | ${p.area}m² | Ref: ${p.reference} | Status: ${p.status || 'disponível'}`).join('\n') || 'Nenhum apartamento cadastrado no momento.';
  return `Você é um CLIENTE em um roleplay de treinamento de vendas para corretores da FQ Imóveis.

PERSONAGEM: ${perfil.nome} (${perfil.negocio})
PERFIL: ${perfil.estilo}
DOR PRINCIPAL: ${perfil.dor}

MÓDULO DO TREINO: "${modulo.titulo}"
OBJETIVO: ${modulo.objetivo}

CATÁLOGO DE APARTAMENTOS FQ IMÓVEIS (você pode demonstrar interesse):
${catalogo}

REGRAS DO ROLEPLAY:
1. Fique SEMPRE no personagem. Não quebre o personagem.
2. Responda como se estivesse digitando no WhatsApp, de forma natural, objetiva e no ritmo de uma conversa.
3. Seja difícil de convencer, coloque objeções genuínas.
4. Se o corretor fizer perguntas inteligentes de qualificação, responda com detalhes.
5. Se ele apresentar argumentos fracos, mostre resistência.
6. Se ele apresentar argumentos fortes e benefícios reais, demonstre interesse gradual.
7. Quando o corretor digitar "ENCERRAR TREINO", saia do personagem e dê um FEEDBACK DETALHADO em JSON com este formato EXATO:
{"nota": 7, "abertura": 7, "qualificacao": 6, "apresentacao": 7, "objecoes": 6, "fechamento": 6, "pontos_fortes": ["..."], "pontos_melhora": ["..."], "feedback_geral": "..."}

RUBRICA DE NOTA — seja RIGOROSO, escala 0 a 10:
- 10: execução exemplar.
- 8-9: muito bom, com pouquíssimas falhas.
- 5-7: mediano, atingiu parcialmente.
- 3-4: ruim, muitos erros.
- 0-2: péssimo.

Se o corretor não atingir o objetivo do módulo, a nota final NÃO pode ser maior que 6.
Comece a cena: você acabou de receber uma mensagem no WhatsApp de um corretor da FQ Imóveis. Responda com a primeira frase do cliente.`;
}
