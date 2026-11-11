import { genaiClient } from "./genai-client";
import { serverEnv } from "./env";

const B24_TIMEOUT_MS = 15_000;
const USERS_CACHE_TTL_MS = 10 * 60_000;

export type B24User = {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  PERSONAL_MOBILE?: string;
  PERSONAL_PHONE?: string;
  WORK_PHONE?: string;
  ACTIVE?: boolean;
};

export type StaffMember = { bitrixId: number; name: string };

let usersCache: { users: B24User[]; ts: number } | null = null;
let stagesCache: { map: Record<string, string>; ts: number } | null = null;
const TASKS_CACHE_TTL_MS = 60_000;
const tasksCache = new Map<string, { tasks: B24Task[]; ts: number }>();

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Mapa STAGE_ID → nome do estágio (ex.: "C2:NEW" → "Novo"). Cacheado. */
async function stageMap(): Promise<Record<string, string>> {
  if (stagesCache && Date.now() - stagesCache.ts < USERS_CACHE_TTL_MS) return stagesCache.map;
  const statuses = await b24Call<{ STATUS_ID: string; NAME: string }[]>("crm.status.list", {}).catch(() => []);
  const map: Record<string, string> = {};
  for (const s of statuses ?? []) if (s.STATUS_ID) map[s.STATUS_ID] = s.NAME;
  stagesCache = { map, ts: Date.now() };
  return map;
}

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export async function b24Call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const base = process.env.B24_WEBHOOK_URL;
  if (!base) throw new Error("B24_WEBHOOK_URL não configurada");
  const res = await fetch(`${base.replace(/\/$/, "")}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(B24_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => null)) as { result?: T; error?: string; error_description?: string } | null;
  if (!res.ok || data?.error) {
    throw new Error(`Bitrix ${method} falhou: ${data?.error_description ?? data?.error ?? res.status}`);
  }
  return data?.result as T;
}

export async function listBitrixUsers(): Promise<B24User[]> {
  if (usersCache && Date.now() - usersCache.ts < USERS_CACHE_TTL_MS) return usersCache.users;
  const all: B24User[] = [];
  let start = 0;
  for (;;) {
    // Sem filtro de ACTIVE: resolve também nomes de responsáveis inativos.
    const batch = await b24Call<B24User[]>("user.get", {
      start,
      sort: "ID",
      order: "ASC",
    });
    all.push(...(batch ?? []));
    if (!batch || batch.length < 50) break;
    start += 50;
    if (all.length > 500) break;
  }
  usersCache = { users: all, ts: Date.now() };
  return all;
}

function fullName(u: B24User) {
  return [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Um telefone bate se os últimos 8+ dígitos coincidirem (tolera DDI/DDD/zero à esquerda). */
function phoneMatches(candidate: string, target: string): boolean {
  if (!candidate || !target) return false;
  const min = Math.min(candidate.length, target.length);
  return min >= 8 && (candidate.endsWith(target.slice(-min)) || target.endsWith(candidate.slice(-min)));
}

/** Identifica um funcionário do Bitrix pelo número do WhatsApp (normalizado). */
export async function findStaffByPhone(rawPhone: string): Promise<StaffMember | null> {
  const digits = normalizePhone(rawPhone);
  if (digits.length < 8) return null;
  const users = await listBitrixUsers().catch(() => []);
  for (const u of users) {
    for (const field of [u.PERSONAL_MOBILE, u.WORK_PHONE, u.PERSONAL_PHONE]) {
      if (phoneMatches(digits, normalizePhone(field))) {
        return { bitrixId: Number(u.ID), name: fullName(u) || `Usuário ${u.ID}` };
      }
    }
  }
  return null;
}

/** Candidatos de equipe cujo nome contém/casa com a busca (sem acento, case-insensitive). */
export async function staffCandidates(name: string): Promise<StaffMember[]> {
  const query = norm(name);
  if (query.length < 3) return [];
  const users = await listBitrixUsers().catch(() => []);
  return users
    .filter((u) => {
      const fn = norm(fullName(u));
      return fn === query || fn.includes(query) || norm(u.LAST_NAME ?? "") === query;
    })
    .map((u) => ({ bitrixId: Number(u.ID), name: fullName(u) }));
}

/** Busca funcionário por nome: exato ou único candidato parcial. */
export async function findStaffByName(name: string): Promise<StaffMember | null> {
  const candidates = await staffCandidates(name);
  const query = norm(name);
  const exact = candidates.find((c) => norm(c.name) === query);
  return exact ?? (candidates.length === 1 ? candidates[0] : null);
}

export async function createBitrixTask(input: {
  title: string;
  description?: string;
  responsibleId: number;
  deadlineIso?: string;
}) {
  return b24Call<{ task?: { id?: number }; id?: number }>("tasks.task.add", {
    fields: {
      TITLE: input.title,
      DESCRIPTION: input.description ?? "",
      RESPONSIBLE_ID: input.responsibleId,
      DEADLINE: input.deadlineIso,
      ALLOW_TIME_TRACKING: "N",
    },
  });
}

export async function createCrmContact(input: { name: string; phone?: string; email?: string; comments?: string }) {
  const [first, ...rest] = input.name.trim().split(/\s+/);
  return b24Call<number>("crm.contact.add", {
    fields: {
      NAME: first,
      LAST_NAME: rest.join(" "),
      PHONE: input.phone ? [{ VALUE: input.phone, VALUE_TYPE: "WORK" }] : undefined,
      EMAIL: input.email ? [{ VALUE: input.email, VALUE_TYPE: "WORK" }] : undefined,
      COMMENTS: input.comments ?? "",
      SOURCE_ID: "WEB",
      OPENED: "Y",
    },
  });
}

export async function createCrmDeal(input: { title: string; contactId?: number; responsibleId?: number; comments?: string }) {
  return b24Call<number>("crm.deal.add", {
    fields: {
      TITLE: input.title,
      CONTACT_ID: input.contactId,
      ASSIGNED_BY_ID: input.responsibleId,
      COMMENTS: input.comments ?? "",
      SOURCE_ID: "WEB",
      OPENED: "Y",
    },
  });
}

// ─── Consultas ao CRM/Tarefas para a IA responder perguntas da equipe ─────────

export type B24Task = {
  id?: string;
  ID?: string;
  title?: string;
  TITLE?: string;
  deadline?: string;
  DEADLINE?: string;
  responsibleId?: string;
  RESPONSIBLE_ID?: string;
  status?: string;
  STATUS?: string;
};

const TASK_STATUS: Record<string, string> = { "1": "nova", "2": "pendente", "3": "em andamento", "4": "aguardando", "5": "concluída", "6": "adiada", "7": "recusada" };

// O REST do Bitrix ignora operadores de data (<DEADLINE) e falha ao combinar
// array de STATUS com RESPONSIBLE_ID — por isso filtramos em memória.
const CLOSED_STATUSES = new Set([5, 6, 7]); // concluída, adiada, recusada

export async function queryTasks(input: { responsibleId?: number; deadlineBefore?: Date; deadlineAfter?: Date; onlyClosed?: boolean; includeClosed?: boolean; titleContains?: string }, limit = 40): Promise<B24Task[]> {
  const filter: Record<string, unknown> = { "!STATUS": 5 };
  if (input.responsibleId) filter.RESPONSIBLE_ID = input.responsibleId;

  const cacheKey = JSON.stringify(filter);
  const hit = tasksCache.get(cacheKey);
  let all: B24Task[];
  if (hit && Date.now() - hit.ts < TASKS_CACHE_TTL_MS) {
    all = hit.tasks;
  } else {
    all = [];
    // Páginas em paralelo (4 por vez) — o Bitrix pagina de 50 em 50 e a latência
    // sequencial estourava o timeout da function no Netlify.
    for (let start = 0; start < 500; start += 200) {
      const pages = await Promise.all(
        [0, 1, 2, 3].map((i) =>
          b24Call<{ tasks?: B24Task[] } | B24Task[]>("tasks.task.list", {
            filter,
            select: ["ID", "TITLE", "DEADLINE", "RESPONSIBLE_ID", "STATUS"],
            order: { DEADLINE: "asc" },
            start: start + i * 50,
          }).catch(() => null),
        ),
      );
      let exhausted = false;
      for (const result of pages) {
        const tasks = Array.isArray(result) ? result : (result?.tasks ?? []);
        all.push(...tasks);
        // Lista vem ordenada por deadline crescente: ao passar do limite, o resto não interessa.
        if (input.deadlineBefore && tasks.some((t) => { const d = t.deadline ?? t.DEADLINE; return d && new Date(d).getTime() >= input.deadlineBefore!.getTime(); })) { exhausted = true; break; }
        if (tasks.length < 50) { exhausted = true; break; }
      }
      if (exhausted) break;
    }
    tasksCache.set(cacheKey, { tasks: all, ts: Date.now() });
  }

  return all
    .filter((t) => {
      if (input.titleContains && !String(t.title ?? t.TITLE ?? "").toLowerCase().includes(input.titleContains.toLowerCase())) return false;
      const closed = CLOSED_STATUSES.has(Number(t.status ?? t.STATUS ?? 0));
      if (input.includeClosed ? false : input.onlyClosed ? !closed : closed) return false;
      const dl = t.deadline ?? t.DEADLINE ? new Date((t.deadline ?? t.DEADLINE)!).getTime() : NaN;
      if (input.deadlineBefore && !(dl && dl < input.deadlineBefore.getTime())) return false;
      if (input.deadlineAfter && !(dl && dl > input.deadlineAfter.getTime())) return false;
      return true;
    })
    .slice(0, limit);
}

/** Lista agrupada por responsável — formato de cobrança. */
async function taskLinesGrouped(tasks: B24Task[]): Promise<string> {
  const ids = [...new Set(tasks.map((t) => String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  await Promise.all(ids.map(async (id) => names.set(id, await responsibleName(id))));

  const groups = new Map<string, B24Task[]>();
  for (const t of tasks) {
    const key = String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "");
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([resp, list]) => {
      const name = names.get(resp) ?? "sem responsável";
      const items = list
        .map((t) => {
          const deadline = t.deadline ?? t.DEADLINE;
          const when = deadline ? new Date(deadline).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "sem prazo";
          return `  • #${t.id ?? t.ID} ${(t.title ?? t.TITLE ?? "").slice(0, 60)} (${when})`;
        })
        .join("\n");
      return `*${name}* (${list.length}):\n${items}`;
    })
    .join("\n\n");
}

async function responsibleName(id?: string) {
  if (!id) return "sem responsável";
  const users = await listBitrixUsers().catch(() => []);
  const u = users.find((x) => String(x.ID) === String(id));
  return u ? fullName(u) : `ID ${id}`;
}

function taskLine(t: B24Task, names: Map<string, string>) {
  const deadline = t.deadline ?? t.DEADLINE;
  const status = String(t.status ?? t.STATUS ?? "");
  const responsible = String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "");
  const when = deadline ? new Date(deadline).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "sem prazo";
  return `- #${t.id ?? t.ID} ${t.title ?? t.TITLE ?? ""} — ${names.get(responsible) ?? "sem responsável"} — ${when} (${TASK_STATUS[status] ?? status ?? "?"})`;
}

async function taskLines(tasks: B24Task[]): Promise<string> {
  const ids = [...new Set(tasks.map((t) => String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  await Promise.all(ids.map(async (id) => names.set(id, await responsibleName(id))));
  return tasks.map((t) => taskLine(t, names)).join("\n") || "nenhuma";
}

/** Perguntas de CRM/tarefas que disparam consulta ao Bitrix. Amplo de propósito:
 *  o contexto só é injetado para usuários autenticados/equipe — o gate é a identidade, não a frase. */
export function detectCrmQueryIntent(text: string): boolean {
  return /(tarefa|atrasad|vencid|pipeline|funil|neg[óo]cio|deal|lead|contato|cliente|crm|bitrix|pendente|prazo|agenda|visita|seguidor|follow)/i.test(text);
}

/** Monta contexto com dados REAIS do Bitrix para a IA responder a pergunta da equipe. */
export async function buildCrmContext(text: string, staff: StaffMember | null): Promise<string | null> {
  const now = new Date();
  const sections: string[] = [];
  const overdue = /atrasad|vencid/i.test(text);
  const closed = /conclu[ií]d|finalizad|feita|pronta/i.test(text);
  const week = /semana/i.test(text);
  const upcoming = /amanh|hoje|semana|pr[óo]xim/i.test(text);

  // Resolve a pessoa citada primeiro: se a pergunta é sobre alguém específico,
  // não despejamos a lista global — respondemos só sobre ela.
  const nameProbe =
    text.match(/\b(?:d[oea]?|para|pro|pra|dele|dela|com|sobre|vendedor(?:a)?|corretor(?:a)?|chamad[oa])\s+([A-Za-zÀ-ú]{2,}(?:\s+[A-Za-zÀ-ú]{2,}){0,3})/) ??
    text.match(/(?:^|\s)[oa]\s+([A-ZÀ-Ú][a-zà-ú]{2,}(?:\s+[A-ZÀ-Ú][a-zà-ú]{2,})?)/);
  // Remove palavras-ruído que podem grudar no nome ("da aline" → "aline", "do cliente valquíria" → "valquíria")
  const probeName = nameProbe?.[1].replace(/^(?:(?:o|a|um|uma|de|do|da|dos|das|no|na|em|para|pro|pra|com|cliente|lead|corretor(?:a)?|vendedor(?:a)?|usu[áa]ri[oa]|funcion[áa]ri[oa])\s+)+/i, "").trim() ?? "";
  const aboutCrm = /tarefa|visita|cliente|contato|lead|neg[óo]cio|pendente|crm|bitrix|agenda|prazo/i.test(text);
  let candidates = probeName && aboutCrm ? await staffCandidates(probeName).catch(() => []) : [];
  // Se o nome capturado pegou palavra a mais ("Tiago tem tarefa" → "Tiago tem"),
  // tenta de novo só com o primeiro nome.
  let effectiveName = probeName;
  if (!candidates.length && probeName.includes(" ")) {
    effectiveName = probeName.split(" ")[0];
    candidates = aboutCrm ? await staffCandidates(effectiveName).catch(() => []) : [];
  }
  const query = norm(effectiveName);
  const target = candidates.find((c) => norm(c.name) === query) ?? (candidates.length === 1 ? candidates[0] : null);
  const ambiguous = candidates.length > 1 && !target;

  if (overdue && !target && !ambiguous) {
    const all = await queryTasks({ deadlineBefore: now }, 500);
    sections.push(`Tarefas ATRASADAS no Bitrix (total ${all.length}${all.length >= 500 ? "+" : ""}), agrupadas por responsável:\n${await taskLinesGrouped(all.slice(0, 40))}`);
  }

  if (upcoming && !target && !ambiguous) {
    const horizon = new Date(now.getTime() + (week ? 7 : 2) * 24 * 60 * 60 * 1000);
    const all = await queryTasks({ deadlineAfter: now, deadlineBefore: horizon }, 500);
    sections.push(`Tarefas/visitas com prazo ${week ? "nesta semana" : "até amanhã"} (total ${all.length}):\n${await taskLines(all.slice(0, 40))}`);
  }

  if (staff && /minha|eu\s+tenho|pra\s+mim|comigo|minhas|meu|eu\b/i.test(text) && !target) {
    const all = await queryTasks({ responsibleId: staff.bitrixId, onlyClosed: closed }, 500);
    sections.push(`Tarefas ${closed ? "concluídas" : "abertas"} de ${staff.name} (total ${all.length}${all.length >= 500 ? "+" : ""}):\n${await taskLines(all.slice(0, 40))}`);
  }

  if (target) {
    const all = await queryTasks({ responsibleId: target.bitrixId, deadlineBefore: overdue ? now : undefined, onlyClosed: closed }, 500);
    sections.push(`Tarefas ${closed ? "concluídas" : overdue ? "atrasadas" : "abertas"} de ${target.name} (total ${all.length}${all.length >= 500 ? "+" : ""}):\n${await taskLines(all.slice(0, 40))}`);
  } else if (ambiguous) {
    sections.push(`Encontrei mais de uma pessoa chamada "${effectiveName}" na equipe — especifique:\n${candidates.map((c) => `- ${c.name}`).join("\n")}`);
  }



  if (effectiveName && aboutCrm && !target && !ambiguous) {
    // "Ache tudo": para nomes que não são funcionários, busca em tarefas, negócios, leads e contatos.
    const [tasks, deals, leads, contacts] = await Promise.all([
      b24Call<{ tasks?: B24Task[] } | B24Task[]>("tasks.task.list", {
        filter: { "%TITLE": effectiveName },
        select: ["ID", "TITLE", "DEADLINE", "RESPONSIBLE_ID", "STATUS"],
        order: { DEADLINE: "desc" },
        start: 0,
      }).catch(() => null),
      b24Call<{ ID: string; TITLE: string; STAGE_ID: string; OPPORTUNITY?: string }[]>("crm.deal.list", {
        filter: { "%TITLE": effectiveName },
        select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY"],
        order: { DATE_MODIFY: "desc" },
        start: 0,
      }).catch(() => []),
      b24Call<{ ID: string; NAME?: string; LAST_NAME?: string; PHONE?: { VALUE: string }[] }[]>("crm.lead.list", {
        filter: { "%NAME": effectiveName },
        select: ["ID", "NAME", "LAST_NAME", "PHONE"],
        order: { DATE_MODIFY: "desc" },
        start: 0,
      }).catch(() => []),
      b24Call<{ ID: string; NAME?: string; LAST_NAME?: string; PHONE?: { VALUE: string }[] }[]>("crm.contact.list", {
        filter: { "%NAME": effectiveName },
        select: ["ID", "NAME", "LAST_NAME", "PHONE"],
        order: { DATE_MODIFY: "desc" },
        start: 0,
      }).catch(() => []),
    ]);

    const taskList = (Array.isArray(tasks) ? tasks : (tasks?.tasks ?? [])).filter(
      (t) => CLOSED_STATUSES.has(Number(t.status ?? t.STATUS ?? 0)) === closed,
    );
    if (taskList.length) sections.push(`Tarefas ${closed ? "concluídas" : "abertas"} que mencionam "${effectiveName}":\n${await taskLines(taskList.slice(0, 10))}`);
    const stages = await stageMap();
    if (deals?.length) {
      sections.push(`Negócios no CRM que mencionam "${effectiveName}":\n${deals.slice(0, 10).map((d) => `- #${d.ID} ${d.TITLE} (${stages[d.STAGE_ID] ?? d.STAGE_ID})`).join("\n")}`);
    }

    const leadList = [...(leads ?? []), ...(await b24Call<typeof leads>("crm.lead.list", {
      filter: { "%LAST_NAME": effectiveName },
      select: ["ID", "NAME", "LAST_NAME", "PHONE"],
      order: { DATE_MODIFY: "desc" },
      start: 0,
    }).catch(() => []))];
    if (leadList.length) {
      sections.push(
        `Leads no CRM que mencionam "${effectiveName}":\n${leadList
          .slice(0, 10)
          .map((c) => `- #${c.ID} ${[c.NAME, c.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ")}${c.PHONE?.[0]?.VALUE ? ` (${c.PHONE[0].VALUE})` : ""}`)
          .join("\n")}`,
      );
    }

    const contactList = [...(contacts ?? []), ...(await b24Call<typeof contacts>("crm.contact.list", {
      filter: { "%LAST_NAME": effectiveName },
      select: ["ID", "NAME", "LAST_NAME", "PHONE"],
      order: { DATE_MODIFY: "desc" },
      start: 0,
    }).catch(() => []))];
    if (contactList.length) {
      sections.push(
        `Contatos no CRM que mencionam "${effectiveName}":\n${contactList
          .slice(0, 10)
          .map((c) => `- #${c.ID} ${[c.NAME, c.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ")}${c.PHONE?.[0]?.VALUE ? ` (${c.PHONE[0].VALUE})` : ""}`)
          .join("\n")}`,
      );
    }
  }

  return sections.length ? sections.join("\n\n") : null;
}

// ─── Detecção e extração de pedidos da equipe no WhatsApp ────────────────────

export type StaffAction =
  | {
      kind: "visit";
      clientName: string | null;
      clientPhone: string | null;
      property: string | null;
      datetimeIso: string | null;
      datetimeText: string | null;
      notes: string | null;
    }
  | {
      kind: "client";
      clientName: string;
      clientPhone: string | null;
      interest: string | null;
      notes: string | null;
    }
  | {
      kind: "complete_task";
      taskRef: string | null;
    };

const STAFF_INTENT = /(agenda(r|i)?\s+(uma\s+)?visita|marca(r|do|que)?\s+(uma\s+)?visita|cadastra(r|do|i)?\s+((um[ao]?|[oa])\s+)?(cliente|lead)|registra(r)?\s+((um[ao]?|[oa])\s+)?(cliente|lead)|cria(r)?\s+(uma\s+)?(tarefa|visita)|conclui(r|do)?\s+(a\s+)?tarefa|marca(r|que|do)?\s+.{0,30}como\s+(feita|conclu[ií]da|pronta)|finaliza(r)?\s+(a\s+)?tarefa|fechou?\s+(a\s+)?tarefa|dei?\s+baixa|conclui(r|do)?\s+(a\s+)?(visita|consultoria|follow|fup))/i;

export function detectStaffIntent(text: string): boolean {
  return STAFF_INTENT.test(text);
}

const EXTRACTION_PROMPT = `Você extrai dados estruturados de pedidos de corretores de imóveis em português.

Classifique o pedido e extraia os campos. Responda SOMENTE com JSON válido neste formato:
{
  "kind": "visit" | "client" | "complete_task" | "none",
  "clientName": string | null,
  "clientPhone": string | null,
  "property": string | null,
  "datetimeText": string | null,
  "datetimeIso": string | null,
  "interest": string | null,
  "notes": string | null,
  "taskRef": string | null
}

Regras:
- "visit" = agendar/marcar visita. "client" = cadastrar cliente/lead. "complete_task" = concluir/marcar como feita uma tarefa ou visita existente. "none" = outro assunto.
- taskRef: número da tarefa (#123) ou trecho do título/cliente que identifica a tarefa (ex: "visita da valquíria" → "valquíria").
- datetimeIso: converta data/hora mencionada para ISO 8601 com fuso -03:00 (America/Sao_Paulo). Data de referência (hoje): %TODAY%. Se não der pra converter, use null e preserve datetimeText.
- clientPhone: só dígitos com DDD se informado.
- property: nome/ref do empreendimento se citado.
- interest: resumo do que o cliente procura (ex: "3 quartos na Pampulha até 600 mil").
- notes: demais detalhes úteis (ex: corretor responsável, origem do lead).`;

export async function extractStaffAction(text: string): Promise<StaffAction | null> {
  const env = serverEnv();
  const ai = genaiClient();
  const today = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [{ text: `${EXTRACTION_PROMPT.replace("%TODAY%", today)}\n\nPedido: ${text}` }],
    config: { temperature: 0, responseMimeType: "application/json" },
  });
  const raw = response.text?.trim() ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown> & { kind?: string };
    if (parsed.kind === "visit") {
      return {
        kind: "visit",
        clientName: (parsed.clientName as string) ?? null,
        clientPhone: (parsed.clientPhone as string) ?? null,
        property: (parsed.property as string) ?? null,
        datetimeIso: (parsed.datetimeIso as string) ?? null,
        datetimeText: (parsed.datetimeText as string) ?? null,
        notes: (parsed.notes as string) ?? null,
      };
    }
    if (parsed.kind === "complete_task") {
      return { kind: "complete_task", taskRef: (parsed.taskRef as string) ?? null };
    }
    if (parsed.kind === "client" && typeof parsed.clientName === "string" && parsed.clientName.trim()) {
      return {
        kind: "client",
        clientName: parsed.clientName.trim(),
        clientPhone: (parsed.clientPhone as string) ?? null,
        interest: (parsed.interest as string) ?? null,
        notes: (parsed.notes as string) ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function describeAction(action: StaffAction, staffName: string): string {
  if (action.kind === "complete_task") {
    const ref = action.taskRef ? ` "${action.taskRef}"` : "";
    return `📋 Concluir tarefa${ref} — responsável: ${staffName}.\n\nConfirma? (responde "sim" ou corrige)`;
  }
  if (action.kind === "visit") {
    const when = action.datetimeText ?? action.datetimeIso ?? "sem data definida";
    const where = action.property ? ` no ${action.property}` : "";
    const who = action.clientName ? ` com ${action.clientName}` : "";
    return `📋 Visita${who}${where}, ${when} — responsável: ${staffName}.\n\nConfirma? (responde "sim" ou corrige)`;
  }
  const phone = action.clientPhone ? ` (${action.clientPhone})` : "";
  const interest = action.interest ? ` — interesse: ${action.interest}` : "";
  return `📋 Cadastrar cliente ${action.clientName}${phone}${interest}.\n\nConfirma? (responde "sim" ou corrige)`;
}

export function confirmMessageFor(action: StaffAction, staffName: string): string {
  return describeAction(action, staffName);
}

export function isConfirmation(text: string): boolean {
  return /^(sim|isso|confirma|confirmado|pode|ok|bora|vai)\b/i.test(text.trim());
}

/** Executa a ação confirmada no Bitrix24 e devolve o resumo para o WhatsApp. */
export async function executeStaffAction(action: StaffAction, staff: StaffMember): Promise<string> {
  if (action.kind === "complete_task") {
    const ref = (action.taskRef ?? "").replace(/^#/, "").trim();
    let task: B24Task | null = null;

    if (/^\d+$/.test(ref)) {
      const all = await queryTasks({ responsibleId: staff.bitrixId }, 500);
      task = all.find((t) => String(t.id ?? t.ID) === ref) ?? null;
      if (!task) {
        // tarefa pode ser de outro responsável ou já fechada
        const found = await b24Call<{ task?: B24Task } | B24Task>("tasks.task.get", { taskId: Number(ref), select: ["ID", "TITLE", "STATUS"] }).catch(() => null);
        task = (found as { task?: B24Task })?.task ?? (found as B24Task | null);
      }
    } else if (ref) {
      const all = await queryTasks({ responsibleId: staff.bitrixId }, 500);
      const matches = all.filter((t) => norm(String(t.title ?? t.TITLE ?? "")).includes(norm(ref)));
      if (matches.length > 1) {
        return `Encontrei ${matches.length} tarefas suas com "${ref}":\n${matches.slice(0, 6).map((t) => `• #${t.id ?? t.ID} ${(t.title ?? t.TITLE ?? "").slice(0, 55)}`).join("\n")}\n\nMe diz o número (#) da que você quer concluir.`;
      }
      task = matches[0] ?? null;
    }

    if (!task) return `Não encontrei tarefa aberta ${ref ? `com "${ref}" ` : ""}atribuída a você. Me manda o número (#) dela que eu concluo.`;
    await b24Call("tasks.task.complete", { taskId: Number(task.id ?? task.ID) });
    return `✅ Tarefa #${task.id ?? task.ID} "${task.title ?? task.TITLE ?? ""}" marcada como concluída.`;
  }

  if (action.kind === "visit") {
    const lines = [
      `Cliente: ${action.clientName ?? "não informado"}`,
      action.clientPhone ? `Telefone: ${action.clientPhone}` : null,
      action.property ? `Imóvel: ${action.property}` : null,
      `Quando: ${action.datetimeText ?? action.datetimeIso ?? "a definir"}`,
      action.notes,
      `Agendado por ${staff.name} via WhatsApp/IA`,
    ].filter(Boolean);

    const result = await createBitrixTask({
      title: `Visita Agendada - ${action.clientName ?? "Cliente"}${action.property ? ` - ${action.property}` : ""}`,
      description: lines.join("\n"),
      responsibleId: staff.bitrixId,
      deadlineIso: action.datetimeIso ?? undefined,
    });
    const taskId = (result as { task?: { id?: number } })?.task?.id ?? (result as { id?: number })?.id;
    return `✅ Visita criada no Bitrix (tarefa #${taskId ?? "?"}), atribuída a ${staff.name}.`;
  }

  const contactId = await createCrmContact({
    name: action.clientName,
    phone: action.clientPhone ?? undefined,
    comments: [action.interest ? `Interesse: ${action.interest}` : null, action.notes, `Cadastrado por ${staff.name} via WhatsApp/IA`]
      .filter(Boolean)
      .join("\n"),
  });
  let dealNote = "";
  try {
    const dealId = await createCrmDeal({
      title: `Lead - ${action.clientName}`,
      contactId: contactId,
      responsibleId: staff.bitrixId,
      comments: action.interest ? `Interesse: ${action.interest}` : "",
    });
    dealNote = ` e negócio #${dealId}`;
  } catch (e) {
    console.error("b24_deal_failed", e instanceof Error ? e.message : "unknown");
  }
  return `✅ Cliente cadastrado no Bitrix (contato #${contactId}${dealNote}), atribuído a ${staff.name}.`;
}
