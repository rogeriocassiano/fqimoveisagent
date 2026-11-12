// Round 3 — cobertura ampla do Bitrix: datas, visitas, negócios novos,
// empresas, propostas, departamentos, grupos, produtos, etapas, agenda.
// WA_SERVICE_SECRET=<prod> B24_WEBHOOK_URL=<...> node scripts/prod-crm-smoke3.mjs
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
  if (j.error) throw new Error(`${m}: ${j.error}`);
  return j.result;
}
const b24all = async (m, p = {}) => {
  const out = [];
  for (let s = 0; s < 500; s += 50) {
    const a = await b24(m, { ...p, start: s });
    const items = Array.isArray(a) ? a : (a?.tasks ?? a?.items ?? []);
    out.push(...items);
    if (items.length < 50) break;
  }
  return out;
};
const ask = async (text, from) => {
  const r = await fetch(`${BASE}/api/webhooks/wa-session`, { method: "POST", headers: { "content-type": "application/json", "x-wa-secret": SECRET }, body: JSON.stringify({ type: "message", sessionId: SESSION, from, pushName: "Teste", text }) });
  const j = await r.json().catch(() => ({}));
  console.log(`  >> ${(j.reply ?? "").slice(0, 320)}\n`);
  return j.reply ?? "";
};
const TIAGO = "5531991069258";
const FELIPE = "5531994036189";

// ── verdade ──
const nov = { gte: "2026-11-01T00:00:00-03:00", lte: "2026-11-30T23:59:59-03:00" };
const dealsNov = await b24all("crm.deal.list", { filter: { ">=DATE_CREATE": nov.gte, "<=DATE_CREATE": nov.lte }, select: ["ID"] });
const closedNovVisits = await b24all("tasks.task.list", { filter: { STATUS: 5, ">=CLOSED_DATE": nov.gte, "<=CLOSED_DATE": nov.lte }, select: ["ID", "TITLE"] });
const visitsReal = closedNovVisits.filter((t) => /visita/i.test(t.title ?? t.TITLE ?? ""));
const companies = await b24("crm.company.list", { select: ["ID", "TITLE"] });
const products = await b24("crm.product.list", { select: ["ID", "NAME"] });
const depts = await b24("department.get", {});
const groups = await b24("sonet_group.get", {});
const quotes = await b24("crm.quote.list", { filter: { "%TITLE": "Simone" }, select: ["ID", "TITLE"] });
console.log(`verdade: deals nov=${dealsNov.length} | visitas nov=${visitsReal.length} | empresas=${companies.length} | produtos=${products.length} | depts=${depts.length} | grupos=${groups.length} | quotes Simone=${quotes.length}\n`);

let r = await ask("quantas visitas foram realizadas no mes de novembro?", TIAGO);
ok("visitas realizadas novembro -> número coerente", /\d/.test(r) && /visita|nenhuma|0/.test(r), `real=${visitsReal.length}`);

r = await ask("quantos novos negocios foram incluidos em novembro?", FELIPE);
const nDeals = (r.match(/\d+/g) ?? []).map(Number);
ok("novos negócios novembro -> total real", nDeals.includes(dealsNov.length) || /nenhum|0 neg/.test(r), `real=${dealsNov.length}`);

r = await ask("quais empresas temos cadastradas no crm?", TIAGO);
ok("empresas -> lista", /empresa|imob|fq|ltda|construtora|incorporadora/i.test(r), `real=${companies.length}`);

r = await ask("quais sao as etapas do funil de vendas?", FELIPE);
ok("etapas do funil -> lista estágios", /etapa|est[áa]gio|stage|funil|novo|contato|prepar|proposta|fechad|won|ganho/i.test(r));

r = await ask("existe proposta ou orcamento pra alguma cliente chamada Simone?", TIAGO);
ok("proposta Simone -> quote ou resposta honesta", /simone|proposta|or[çc]amento|nenhum|n[ãa]o encontr/i.test(r), `quotes=${quotes.length}`);

r = await ask("quais departamentos existem no nosso bitrix?", FELIPE);
ok("departamentos -> lista", /vendas|depart|comercial|marketing|rh|administr|diret/i.test(r) || /dept/i.test(r), `real=${depts.length}`);

r = await ask("quais grupos de trabalho existem no bitrix?", TIAGO);
ok("grupos -> lista", /grupo|fq|vendas|equipe/i.test(r), `real=${groups.length}`);

r = await ask("o que temos no catalogo de produtos do crm?", FELIPE);
ok("produtos -> lista ou vazio honesto", /produto|cat[áa]logo|nenhum|vazio|im[óo]vel|servi[çc]o/i.test(r), `real=${products.length}`);

r = await ask("quem e o responsavel pelo negocio 54654?", TIAGO);
ok("deal por ID -> responsável", /tiago|respons[áa]vel/i.test(r));

r = await ask("tem atividade registrada hoje no crm? ligacoes, reunioes?", FELIPE);
ok("atividades hoje -> resposta", /atividade|liga[çc]|reuni|nenhum|hoje/i.test(r));

r = await ask("o que tem na agenda de amanha?", TIAGO);
ok("agenda amanhã -> resposta", /agenda|amanh|visita|tarefa|nenhum|nada/i.test(r));

console.log(`\n== ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail ? 1 : 0);
