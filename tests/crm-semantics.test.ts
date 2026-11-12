import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch { /* ignore */ }
}

const B24 = (process.env.B24_WEBHOOK_URL ?? "").replace(/\/$/, "");
const spDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = spDate(new Date());
const dow = (today.getDay() + 6) % 7;
const R = (a: Date, b: Date) => ({ gte: `${ymd(a)}T00:00:00-03:00`, lte: `${ymd(b)}T23:59:59-03:00` });
const P = {
  today: R(today, today),
  yesterday: R(addDays(today, -1), addDays(today, -1)),
  tomorrow: R(addDays(today, 1), addDays(today, 1)),
  thisWeek: R(addDays(today, -dow), addDays(today, 6 - dow)),
  lastWeek: R(addDays(today, -dow - 7), addDays(today, -dow - 1)),
  thisMonth: R(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  lastMonth: R(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)),
};

async function total(method: string, filter: Record<string, unknown>) {
  const r = await fetch(`${B24}/${method}.json`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filter, select: ["ID"] }), signal: AbortSignal.timeout(25000) });
  const j = await r.json();
  return j.total ?? (Array.isArray(j.result) ? j.result.length : (j.result?.tasks ?? []).length);
}
const visitsDone = (p: { gte: string; lte: string }, resp?: number) => total("tasks.task.list", { STATUS: 5, "%TITLE": "visita", ">=CLOSED_DATE": p.gte, "<=CLOSED_DATE": p.lte, ...(resp ? { RESPONSIBLE_ID: resp } : {}) });
const visitsDue = (p: { gte: string; lte: string }, resp?: number) => total("tasks.task.list", { "!STATUS": 5, "%TITLE": "visita", ">=DEADLINE": p.gte, "<=DEADLINE": p.lte, ...(resp ? { RESPONSIBLE_ID: resp } : {}) });
const created = (m: string, p: { gte: string; lte: string }, resp?: number) => total(m, { ">=DATE_CREATE": p.gte, "<=DATE_CREATE": p.lte, ...(resp ? { ASSIGNED_BY_ID: resp } : {}) });
const nums = (s: string) => (s.replace(/(\d)\.(\d{3})/g, "$1$2").match(/\d+/g) ?? []).map(Number);

const TIAGO = { id: 30, name: "Tiago Maron", bitrixId: "30" };
const FELIPE = { id: 1, name: "Felipe Queiroz", bitrixId: "1" };
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;

const CASES: [string, typeof TIAGO, () => Promise<number>][] = [
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

describe.skipIf(!B24)("semântica CRM", () => {
  writeFileSync("crm-semantics-report.txt", "");
  for (let i = 0; i < CASES.length; i++) {
    const [q, who, truthFn] = CASES[i];
    if (ONLY && !ONLY.has(i + 1)) continue;
    it(`#${i + 1} ${q}`, async () => {
      const { answerWithBitrixTools } = await import("../lib/bitrix-agent");
      const [truth, reply] = await Promise.all([truthFn().catch(() => -999), answerWithBitrixTools(q, who as never).catch((e) => `THREW: ${e.message}`)]);
      const n = nums(reply ?? "");
      const ok = n.includes(truth) || (truth === 0 && /nenhum|nenhuma|\b0\b/i.test(reply ?? ""));
      appendFileSync("crm-semantics-report.txt", `${ok ? "PASS" : "FAIL"} #${i + 1} verdade=${truth} | ${q}\n>> ${(reply ?? "").replace(/\s+/g, " ").slice(0, 280)}\n\n`);
      if (!ok) throw new Error(`verdade=${truth} reply=${(reply ?? "").slice(0, 200)}`);
    }, 180_000);
  }
});
