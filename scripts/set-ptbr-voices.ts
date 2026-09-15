// Adiciona vozes PT-BR da Voice Library à conta e aplica nos agentes de treino.
// Rodar: ELEVENLABS_API_KEY=... npx tsx scripts/set-ptbr-voices.ts
const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY!;
const H = { "xi-api-key": KEY, "Content-Type": "application/json" };

// voice_id da Voice Library → agente do perfil
const MAP: { perfil: string; sharedVoiceId: string; agentId: string }[] = [
  { perfil: "João",    sharedVoiceId: "lcMhY7YrY28yzdrqwsto", agentId: "agent_0301m2gt6s7hft9vkcj3nwnwwjr3" }, // Bruno Mando
  { perfil: "Carlos",  sharedVoiceId: "eQWF9cPPyZapD4H5zJVq", agentId: "agent_7501m2gt6v24fkarwfz9m8jd909h" }, // Cristiano Bredda
  { perfil: "Mariana", sharedVoiceId: "P5sGFFRJfG9S2mevGUay", agentId: "agent_4401m2gt6wjaf5rszcc4yck4gfn7" }, // Jhenyfer
  { perfil: "Ana",     sharedVoiceId: "gMupnH2kaan7D6ONg13S", agentId: "agent_0901m2gt6y7re3ht9ass4m7hcd6w" }, // Laila Veronez
  { perfil: "Roberto", sharedVoiceId: "bcJsIi0oiUPOMaBpJHGF", agentId: "agent_2001m2gt6zqkfg5sh3e9v9p2ktav" }, // Adriano
];

async function main() {
  // Vozes já adicionadas na conta (para re-rodar sem duplicar)
  const mine = await fetch(`${API}/voices`, { headers: H }).then(r => r.json());
  const owned = new Set((mine.voices ?? []).map((v: { voice_id: string }) => v.voice_id));

  for (const m of MAP) {
    // Busca a voz na library pelo id
    const lib = await fetch(`${API}/shared-voices?language=pt&page_size=100`, { headers: H }).then(r => r.json());
    const shared = (lib.voices ?? []).find((v: { voice_id: string }) => v.voice_id === m.sharedVoiceId);
    if (!shared) { console.log(`✗ ${m.perfil}: voz não encontrada`); continue; }

    // Adiciona na conta (ou reutiliza se já existe)
    let voiceId = m.sharedVoiceId;
    if (!owned.has(voiceId)) {
      const add = await fetch(`${API}/voices/add/${shared.public_owner_id}/${shared.voice_id}`, {
        method: "POST", headers: H,
        body: JSON.stringify({ new_name: `FQ ${m.perfil} - ${shared.name}` }),
      });
      const addBody = await add.json().catch(() => ({}));
      if (!add.ok) { console.log(`✗ ${m.perfil}: add falhou ${add.status} ${JSON.stringify(addBody).slice(0, 150)}`); continue; }
      voiceId = addBody.voice_id ?? voiceId;
    }

    const patch = await fetch(`${API}/convai/agents/${m.agentId}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ conversation_config: { tts: { voice_id: voiceId, model_id: "eleven_flash_v2_5" } } }),
    });
    console.log(`${patch.ok ? "✓" : "✗"} ${m.perfil}: ${shared.name} (${voiceId}) -> ${patch.status}`);
  }
}
main();
