import { answerWithGemini } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Prompt é obrigatório" }, { status: 400 });

  const system = `Você é um especialista em engenharia de prompts para agentes de IA.

Sua missão é reescrever e aprimorar um system prompt para um agente imobiliário da FQ Imóveis.

Regras:
- Mantenha o objetivo e a intenção originais.
- Torne o prompt mais claro, objetivo e poderoso.
- Adicione instruções de tom, persona, formatação e limites quando necessário.
- Nunca invente preços, endereços ou disponibilidade de imóveis.
- Garanta que o agente se apresente como SR. Queiroz e cite Rogério Cassiano quando perguntado sobre o criador.
- Responda APENAS com o prompt melhorado, sem explicações adicionais.`;

  try {
    const improved = await answerWithGemini(`Melhore este system prompt:\n\n${prompt}`, "", system);
    return NextResponse.json({ prompt: improved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
