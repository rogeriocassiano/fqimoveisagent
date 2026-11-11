// Round 2 — perguntas sobre clientes/negócios/leads específicos em produção.
// WA_SERVICE_SECRET=<prod> B24_WEBHOOK_URL=<...> node scripts/prod-crm-smoke2.mjs
const BASE = "https://fq-imoveis.netlify.app";
const SESSION = "cbe5e16b-bc59-4127-9c36-7bc94426e483";
const SECRET = process.env.WA_SERVICE_SECRET;
const B24 = process.env.B24_WEBHOOK_URL;
if (!SECRET || !B24) { console.error("Defina WA_SERVICE_SECRET e B24_WEBHOOK_URL"); process.exit(1); }

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${e ? " — " + e : ""}`); c ? pass++ : fail++; };

async function b24(m, p = {}) {
  const r = await fetch(`${B24.replace(/\/$/, "")}/${m}.json`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p), signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const ask = async (text, from) => {
  const r = await fetch(`${BASE}/api/webhooks/wa-session`, { method: "POST", headers: { "content-type": "application/json", "x-wa-secret": SECRET }, body: JSON.stringify({ type: "message", sessionId: SESSION, from, pushName: "Teste", text }) });
  const j = await r.json().catch(() => ({}));
  console.log(`  >> ${(j.reply ?? "").slice(0, 350)}\n`);
  return j.reply ?? "";
};
const TIAGO = "5531991069258";
const POLLY = "5531997071063";
const FELIPE = "5531994036189";

// ── verdade da API ─────────────────────────────────────────────
const katia = await b24("crm.contact.list", { filter: { "%NAME": "Katia" }, select: ["ID", "NAME", "LAST_NAME", "PHONE"] });
const nani = await b24("crm.contact.list", { filter: { "%NAME": "Nani" }, select: ["ID", "NAME", "LAST_NAME", "PHONE"] });
const wilmaDeal = await b24("crm.deal.list", { filter: { "%TITLE": "Wilma" }, select: ["ID", "TITLE", "STAGE_ID"] });
const leadsN = await b24("crm.lead.list", { select: ["ID"], start: 0 });
const task956 = await b24("tasks.task.get", { taskId: 956, select: ["ID", "TITLE", "DEADLINE", "RESPONSIBLE_ID"] });
console.log(`verdade: Katia=${katia.length} contato(s) | Nani=${nani.length} | deal Wilma=${wilmaDeal.length} | leads>=${leadsN.length} | task956="${task956?.task?.TITLE ?? task956?.TITLE}"\n`);

let r = await ask("quem é a cliente Katia Cruz? tem telefone dela?", TIAGO);
ok("Katia Cruz -> contato + telefone", /katia/i.test(r) && (/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(r) || /telefone|celular|número/i.test(r)));

r = await ask("existe cliente chamada Nani Pontello?", TIAGO);
ok("Nani Pontello -> acha no CRM", /nani/i.test(r));

r = await ask("a Wilma Reis tem negocio no funil?", TIAGO);
ok("Wilma Reis -> negócio", /wilma/i.test(r) && /neg[oó]cio|funil|deal|etapa|stage/i.test(r));

r = await ask("tem cadastro da cliente Isabela Almeida?", POLLY);
ok("Isabela Almeida -> contato/deal", /isabela/i.test(r) && /almeida/i.test(r));

r = await ask("quantos leads temos cadastrados?", FELIPE);
ok("total de leads -> número real", /\d+/.test(r) && /lead/i.test(r));

r = await ask("tem lead chamado Thiago Brayan?", TIAGO);
ok("lead Thiago Brayan -> acha", /thiago|brayan/i.test(r));

r = await ask("me passa os detalhes da tarefa 956", TIAGO);
ok("tarefa 956 -> detalhes", /956/.test(r) && (/segunda voz|deadline|prazo|respons/i.test(r) || /tiago/i.test(r)), `real="${task956?.task?.TITLE ?? task956?.TITLE}"`);

r = await ask("qual cliente esta vinculado ao negocio do Marcus Vinicius?", TIAGO);
ok("deal Marcus -> título/contato", /marcus/i.test(r));

r = await ask("a Simone Ruas e cliente ou so contato? tem negocio dela?", POLLY);
ok("Simone Ruas -> contato + negócio", /simone/i.test(r) && /ruas/i.test(r));

r = await ask("qual o telefone da cliente Nani?", TIAGO);
ok("telefone Nani -> número", /nani/i.test(r));

r = await ask("o cliente Katia Cruz tem alguma tarefa aberta com a gente?", FELIPE);
ok("Katia -> verifica tarefas vinculadas", /katia/i.test(r));

r = await ask("busca um cliente chamado Zepelim da Silva", TIAGO);
ok("cliente inexistente -> resposta honesta (sem inventar)", !/\(\d{2}\)\s?9\d{4}[-\s]?\d{4}/.test(r) || /n[aã]o (encontrei|achei|existe|localizei)|nenhum|sem cadastro/i.test(r), "nao pode inventar telefone");

console.log(`\n== ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail ? 1 : 0);
