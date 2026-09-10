import { answerWithGemini } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST() {
  const prompt = `Você é um especialista em criação de agentes de IA para imobiliárias.

Gere uma sugestão completa para um novo agente da FQ Imóveis.

Considere:
- A FQ Imóveis é uma imobiliária familiar de Belo Horizonte com +10 anos.
- Especialistas em apartamentos na planta, primeiro apartamento e investimento.
- Representam +45 construtoras e +250 apartamentos.
- O agente deve ser útil para corretores e clientes.

Responda APENAS em JSON com este formato EXATO:
{
  "name": "Nome do agente",
  "persona": "Descrição da persona",
  "tone": "Tom de comunicação",
  "system_prompt": "Instrução de sistema completa",
  "training_suggestions": ["Tópico 1 para treinar", "Tópico 2", "Tópico 3"]
}

Seja objetivo, criativo e alinhado com o contexto da FQ Imóveis.`;

  try {
    const raw = await answerWithGemini("Gere uma sugestão de agente imobiliário para a FQ Imóveis.", "", prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta não contém JSON");
    const suggestion = JSON.parse(match[0]);
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
