// Auditoria semântica do agente CRM em produção: cada pergunta tem a verdade
// calculada na hora pela API do Bitrix (campo total oficial).
// WA_SERVICE_SECRET=<prod> B24_WEBHOOK_URL=<...> node scripts/prod-crm-semantics.mjs
const BASE = "https://fq-imoveis.netlify.app";
const SESSION = "cbe5e16b-bc59-4127-9c36-7bc94426e483";
const SECRET = process.env.WA_SERVICE_SECRET;
const B24 = process.env.B24_WEBHOOK_URL?.replace(/\/$/, "");
if (!SECRET || !B24) { console.error("Defina WA_SERVICE_SECRET e B24_WEBHOOK_URL"); process.exit(1); }
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;

const TIAGO = { id: 30, phone: "5531991069258" };
const FELIPE = { id: 1, phone: "5531994036189" };

// ── datas no fuso de São Paulo ──
const spDate = (d) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = spDate(new Date());
const dow = (today.getDay() + 6) % 7; // 0 = segunda
const R = (a, b) => ({ gte: `${ymd(a)}T00:00:00-03:00`, lte: `${ymd(b)}T23:59:59-03:00`, label: `${ymd(a)}..${ymd(b)}` });
const P = {
  today: R(today, today),
  yesterday: R(addDays(today, -1), addDays(today, -1)),
  tomorrow: R(addDays(today, 1), addDays(today, 1)),
  thisWeek: R(addDays(today, -dow), addDays(today, 6 - dow)),
  lastWeek: R(addDays(today, -dow - 7), addDays(today, -dow - 1)),
  thisMonth: R(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  lastMonth: R(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)),
};

async function total(method, filter) {
  const r = await fetch(`${B24}/${method}.json`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filter, select: ["ID"] }), signal: AbortSignal.timeout(25000) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error}`);
  return j.total ?? (Array.isArray(j.result) ? j.result.length : (j.result?.tasks ?? []).length);
}
const visitsDone = (p, resp) => total("tasks.task.list", { STATUS: 5, "%TITLE": "visita", ">=CLOSED_DATE": p.gte, "<=CLOSED_DATE": p.lte, ...(resp ? { RESPONSIBLE_ID: resp } : {}) });
const visitsDue = (p, resp) => total("tasks.task.list", { "!STATUS": 5, "%TITLE": "visita", ">=DEADLINE": p.gte, "<=DEADLINE": p.lte, ...(resp ? { RESPONSIBLE_ID: resp } : {}) });
const created = (m, p, resp) => total(m, { ">=DATE_CREATE": p.gte, "<=DATE_CREATE": p.lte, ...(resp ? { ASSIGNED_BY_ID: resp } : {}) });

async function ask(text, from) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/webhooks/wa-session`, { method: "POST", headers: { "content-type": "application/json", "x-wa-secret": SECRET }, body: JSON.stringify({ type: "message", sessionId: SESSION, from, pushName: "Teste", text }), signal: AbortSignal.timeout(120000) }).catch((e) => ({ status: "ERR " + e.message, json: async () => ({}) }));
  const j = await r.json().catch(() => ({}));
  return { reply: j.reply ?? "", status: r.status, secs: ((Date.now() - t0) / 1000).toFixed(1) };
}
const nums = (s) => (s.replace(/(\d)\.(\d{3})/g, "$1$2").match(/\d+/g) ?? []).map(Number);

// [pergunta, quem pergunta, verdade (async), modo: "team" | "self"]
const CASES = [
  ["quantas visitas foram realizadas hoje?", TIAGO, () => visitsDone(P.today)],
  ["quantas visitas a equipe fez ontem?", FELIPE, () => visitsDone(P.yesterday)],
  ["quantas visitas temos agendadas pra amanhã?", TIAGO, () => visitsDue(P.tomorrow)],
  ["quantas visitas foram feitas essa semana?", FELIPE, () => visitsDone(P.thisWeek)],
  ["quantas visitas foram feitas na semana passada?", FELIPE, () => visitsDone(P.lastWeek)],
  ["quantas visitas foram realizadas no mês passado?", TIAGO, () => visitsDone(P.lastMonth)],
  ["quantas visitas EU fiz esse mês?", TIAGO, () => visitsDone(P.thisMonth, TIAGO.id)],
  ["quantas visitas o Tiago fez na semana passada?", FELIPE, () => visitsDone(P.lastWeek, TIAGO.id)],
  ["quantos negócios novos entraram hoje?", FELIPE, () => created("crm.deal.list", P.today)],
  ["quantos negócios foram criados em outubro?", FELIPE, () => created("crm.deal.list", P.lastMonth)],
  ["quantos negócios novos eu recebi essa semana?", TIAGO, () => created("crm.deal.list", P.thisWeek, TIAGO.id)],
  ["quantos leads entraram esse mês?", FELIPE, () => created("crm.lead.list", P.thisMonth)],
  ["quantos contatos novos foram cadastrados ontem?", TIAGO, () => created("crm.contact.list", P.yesterday)],
  ["quantos negócios estão ganhos no total?", FELIPE, () => total("crm.deal.list", { STAGE_SEMANTIC_ID: "S" })],
  ["quantos negócios foram perdidos esse mês?", FELIPE, () => total("crm.deal.list", { STAGE_SEMANTIC_ID: "F", ">=CLOSEDATE": P.thisMonth.gte, "<=CLOSEDATE": P.thisMonth.lte })],
  ["quantas tarefas foram criadas hoje?", TIAGO, () => total("tasks.task.list", { ">=CREATED_DATE": P.today.gte, "<=CREATED_DATE": P.today.lte })],
  ["quantas tarefas foram concluídas ontem?", FELIPE, () => total("tasks.task.list", { STATUS: 5, ">=CLOSED_DATE": P.yesterday.gte, "<=CLOSED_DATE": P.yesterday.lte })],
  ["quantas ligações foram registradas no crm hoje?", FELIPE, () => total("crm.activity.list", { TYPE_ID: 2, ">=CREATED": P.today.gte, "<=CREATED": P.today.lte })],
];

let pass = 0, fail = 0;
const fails = [];
for (let i = 0; i < CASES.length; i++) {
  if (ONLY && !ONLY.has(i + 1)) continue;
  const [q, who, truthFn] = CASES[i];
  const truth = await truthFn().catch((e) => `ERR ${e.message}`);
  const { reply, status, secs } = await ask(q, who.phone);
  const n = nums(reply);
  const ok = typeof truth === "number" && (n.includes(truth) || (truth === 0 && /nenhum|nenhuma|\b0\b/i.test(reply)));
  ok ? pass++ : (fail++, fails.push(i + 1));
  console.log(`${ok ? "PASS" : "FAIL"} #${i + 1} [${secs}s ${status}] verdade=${truth} | ${q}`);
  console.log(`     >> ${reply.replace(/\s+/g, " ").slice(0, 260) || "(vazio)"}\n`);
}
console.log(`Períodos: ${Object.entries(P).map(([k, v]) => `${k}=${v.label}`).join(" | ")}`);
console.log(`\n== ${pass} passaram, ${fail} falharam ${fails.length ? `(#${fails.join(",")})` : ""} ==`);
process.exit(fail ? 1 : 0);
