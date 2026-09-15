import "dotenv/config";
import { adminDb } from "../lib/supabase";
import { createCallAgent, buildVoicePrompt, firstMessageFor } from "../lib/elevenlabs";

// Cria um agente de voz no ElevenLabs para cada perfil de treinamento
// que ainda não tenha elevenlabs_agent_id. Rodar: npx tsx scripts/create-el-agents.ts
async function main() {
  const db = adminDb();
  const { data: perfis, error } = await db
    .from("training_profiles")
    .select("id, nome, negocio, estilo, dor, prompt_instrucoes, elevenlabs_agent_id")
    .eq("ativo", true)
    .order("ordem");
  if (error) { console.error("Erro ao listar perfis:", error.message); process.exit(1); }

  for (const perfil of perfis ?? []) {
    if (perfil.elevenlabs_agent_id) {
      console.log(`→ ${perfil.nome}: já tem agente (${perfil.elevenlabs_agent_id})`);
      continue;
    }
    try {
      const elAgentId = await createCallAgent(`FQ Treino - ${perfil.nome}`, buildVoicePrompt(perfil), firstMessageFor(perfil));
      const { error: upErr } = await db.from("training_profiles").update({ elevenlabs_agent_id: elAgentId }).eq("id", perfil.id);
      if (upErr) console.error(`✗ ${perfil.nome}: agente criado (${elAgentId}) mas falhou ao salvar: ${upErr.message}`);
      else console.log(`✓ ${perfil.nome}: agente ${elAgentId}`);
    } catch (e) {
      console.error(`✗ ${perfil.nome}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log("Pronto.");
}

main();
