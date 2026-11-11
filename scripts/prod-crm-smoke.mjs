// Teste E2E do agente CRM em PRODUÇÃO: pergunta como corretores reais
// (telefone cadastrado no Bitrix) e compara a resposta com a verdade da API.
//   B24_WEBHOOK_URL=xxx WA_SERVICE_SECRET=yyy node scripts/prod-crm-smoke.mjs

const BASE = "https://fq-imoveis.netlify.app";
const SESSION = "cbe5e16b-bc59-4127-9c36-7bc94426e483";
const SECRET = process.env.WA_SERVICE_SECRET;
const B24 = process.env.B24_WEBHOOK_URL;

if (!SECRET || !B24) {
  console.error("Defina WA_SERVICE_SECRET e B24_WEBHOOK_URL no ambiente");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (cond) pass++; else fail++;
};

async function b24(method, params = {}) {
  const r = await fetch(`${B24.replace(/\/$/, "")}/${method}.json`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(params), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function ask(text, { from, participant = null } = {}) {
  const res = await fetch(`${BASE}/api/webhooks/wa-session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-wa-secret": SECRET },
    body: JSON.stringify({ type: "message", sessionId: SESSION, from, participant, pushName: "Teste", text }),
  });
  return res.json().catch(() => ({}));
}

// ── Verdade do Bitrix ────────────────────────────────────────────
const users = await b24("user.get", { start: 0, sort: "ID", order: "ASC" });
const nameOf = (id) => {
  const u = users.find((x) => String(x.ID) === String(id));
  return u ? [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() : `ID ${id}`;
};

let allTasks = [];
for (let s = 0; s < 500; s += 50) {
  const t = await b24("tasks.task.list", {
    filter: { "!STATUS": 5 }, select: ["ID", "TITLE", "DEADLINE", "RESPONSIBLE_ID", "STATUS"], start: s,
  });
  const a = Array.isArray(t) ? t : (t?.tasks ?? []);
  allTasks.push(...a);
  if (a.length < 50) break;
}
const CLOSED = new Set([5, 6, 7]);
const open = allTasks.filter((t) => !CLOSED.has(Number(t.status ?? t.STATUS)));
const now = Date.now();
const overdue = open.filter((t) => { const d = t.deadline ?? t.DEADLINE; return d && new Date(d).getTime() < now; });
const week = open.filter((t) => { const d = t.deadline ?? t.DEADLINE; return d && new Date(d).getTime() >= now && new Date(d).getTime() <= now + 7 * 864e5; });
const tasksOf = (id) => open.filter((t) => String(t.responsibleId ?? t.RESPONSIBLE_ID) === String(id));

const TIAGO = { id: "30", phone: "5531991069258" };   // Tiago Maron
const POLLY = { id: "28", phone: "5531997071063" };   // Polly Diniz
const FELIPE = { id: "1", phone: "5531994036189" };   // Felipe Queiroz

console.log(`\n== Verdade Bitrix: ${open.length} abertas | ${overdue.length} atrasadas | ${week.length} próximos 7 dias ==`);
console.log(`   Tiago: ${tasksOf(TIAGO.id).length} | Polly: ${tasksOf(POLLY.id).length} | Felipe: ${tasksOf(FELIPE.id).length}\n`);

// ── Perguntas como staff real ────────────────────────────────────

// 1. próprias tarefas (staff identificado pelo telefone)
let r = await ask("quantas tarefas eu tenho abertas?", { from: TIAGO.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("Tiago pergunta próprias tarefas -> menciona tarefas", /tarefa/i.test(r.reply ?? ""), (r.reply ?? "").split("\n")[0]);

// 2. tarefa de outro corretor
r = await ask("o vendedor Tiago tem tarefa?", { from: POLLY.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("Polly pergunta tarefas do Tiago -> menciona Tiago", /tiago/i.test(r.reply ?? ""));

// 3. ambíguo: duas Marcelas
r = await ask("tem tarefa pra Marcela?", { from: TIAGO.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("Marcela ambíguo -> pede especificação ou lista uma", /marcela/i.test(r.reply ?? ""));

// 4. tarefas atrasadas (global)
r = await ask("quais tarefas estão atrasadas?", { from: FELIPE.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 400)}\n`);
ok("atrasadas -> lista com responsáveis", /atrasad|vencid/i.test(r.reply ?? "") && /:#|\d+ tarefa|Alair|Bruno|José/i.test(r.reply ?? ""));

// 5. semana
r = await ask("o que tem de visita essa semana?", { from: TIAGO.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("semana -> resposta sobre agenda", /semana|visita|agenda|tarefa|nenhuma|não tenho/i.test(r.reply ?? ""));

// 6. cliente (não é staff -> ache tudo)
r = await ask("tem cliente chamado Simone?", { from: POLLY.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 400)}\n`);
ok("cliente Simone -> acha dados no CRM", /simone/i.test(r.reply ?? ""));

// 7. Sérgio ambíguo
r = await ask("o corretor Sérgio tem tarefa pendente?", { from: TIAGO.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("Sérgio ambíguo -> lista opções ou responde um", /s[ée]rgio/i.test(r.reply ?? ""));

// 8. tarefas atrasadas de alguém específico
r = await ask("a Silvana Paiva tem tarefa atrasada?", { from: FELIPE.phone });
console.log(`  >> ${(r.reply ?? "").slice(0, 300)}\n`);
ok("Silvana atrasada -> menciona Silvana", /silvana/i.test(r.reply ?? ""));

// 9. não-staff não vê CRM (segurança)
r = await ask("quais tarefas estão atrasadas?", { from: "5531900000000" });
console.log(`  >> ${(r.reply ?? "").slice(0, 200)}\n`);
ok("não-staff -> sem dados do CRM", !/Alair Junior.*\(\d+\)|Bruno Portugal.*\(\d+\)/s.test(r.reply ?? ""), "vazou lista?" );

console.log(`\n== ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail ? 1 : 0);
