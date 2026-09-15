import { adminDb } from "@/lib/supabase";
import { answerWithGemini } from "@/lib/gemini";
import { getSessionUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = adminDb();
  try {
    const { sessionId, message } = await req.json();
    if (!sessionId || !message) return NextResponse.json({ error: "sessionId e message são obrigatórios" }, { status: 400 });

    const { data: session, error } = await db.from("roleplay_sessions").select("*").eq("id", sessionId).single();
    if (error || !session) return NextResponse.json({ error: error?.message || "Sessão não encontrada" }, { status: 404 });

    const [moduloRow, perfilRow] = await Promise.all([
      db.from("training_modules").select("titulo,objetivo").eq("id", session.modulo_id).single(),
      db.from("training_profiles").select("nome,negocio,estilo,dor").eq("id", session.perfil_id).single(),
    ]);

    const modulo = moduloRow.data ?? {};
    const perfil = perfilRow.data ?? {};

    const mensagens = (session.mensagens as { role: string; content: string }[]) ?? [];
    mensagens.push({ role: "user", content: message });

    const contexto = mensagens.map((m: { role: string; content: string }) => `${m.role === "user" ? "CORRETOR" : "CLIENTE"}: ${m.content}`).join("\n");
    const prompt = buildSystemPrompt(modulo, perfil);
    const text = `ROLEPLAY EM ANDAMENTO:\n\n${contexto}\n\nCORRETOR: ${message}\n\nResponda como o CLIENTE, de forma natural, ou, se o corretor escreveu "ENCERRAR TREINO", dê o feedback em JSON conforme as regras.`;

    const response = await answerWithGemini(text, "", prompt);

    if (message.toUpperCase().includes("ENCERRAR TREINO")) {
      await db.from("roleplay_sessions").update({ mensagens }).eq("id", sessionId);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const feedback = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ feedback });
      }
      return NextResponse.json({ feedback: { nota: 0, feedback_geral: "Não foi possível avaliar. Tente novamente." } });
    }

    mensagens.push({ role: "assistant", content: response });
    await db.from("roleplay_sessions").update({ mensagens }).eq("id", sessionId);

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error("roleplay_chat_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível continuar o roleplay" }, { status: 500 });
  }
}

function buildSystemPrompt(modulo: Record<string, string | number | null>, perfil: Record<string, string | number | null>) {
  return `Você é um CLIENTE em um roleplay de treinamento de vendas para corretores da FQ Imóveis.

PERSONAGEM: ${perfil.nome} (${perfil.negocio})
PERFIL: ${perfil.estilo}
DOR PRINCIPAL: ${perfil.dor}

MÓDULO DO TREINO: "${modulo.titulo}"
OBJETIVO: ${modulo.objetivo}

REGRAS DO ROLEPLAY:
1. Fique SEMPRE no personagem. Não quebre o personagem.
2. Responda como se estivesse digitando no WhatsApp, de forma natural, objetiva e no ritmo de uma conversa.
3. Seja difícil de convencer, coloque objeções genuínas.
4. Se o corretor fizer perguntas inteligentes de qualificação, responda com detalhes.
5. Se ele apresentar argumentos fracos, mostre resistência.
6. Se ele apresentar argumentos fortes e benefícios reais, demonstre interesse gradual.
7. Quando o corretor digitar "ENCERRAR TREINO", saia do personagem e dê um FEEDBACK DETALHADO em JSON com este formato EXATO:
{"nota": 7, "abertura": 7, "qualificacao": 6, "apresentacao": 7, "objecoes": 6, "fechamento": 6, "pontos_fortes": ["..."], "pontos_melhora": ["..."], "feedback_geral": "..."}

RUBRICA DE NOTA — seja RIGOROSO, escala 0 a 10.
Se o corretor não atingir o objetivo do módulo, a nota final NÃO pode ser maior que 6.`;
}
