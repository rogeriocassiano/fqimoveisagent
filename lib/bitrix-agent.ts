import { Type, type Tool } from "@google/genai";
import { genaiClient } from "./genai-client";
import { serverEnv } from "./env";
import { b24Call, listBitrixUsers, queryTasks, staffCandidates, type B24Task, type StaffMember } from "./bitrix";

/**
 * Agente CRM com function calling: o Gemini decide quais métodos do Bitrix24
 * chamar, recebe os resultados reais e responde — cobre QUALQUER pergunta
 * sobre o CRM sem precisar de padrões fixos de consulta.
 *
 * Leitura é livre; escrita continua no fluxo de confirmação (detectStaffIntent).
 */

const CRM_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "list_tasks",
        description:
          "Lista tarefas do Bitrix24 com filtros. Retorna o total real e as primeiras N tarefas. Use para qualquer pergunta sobre tarefas, visitas, prazos, atrasos e agenda.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            responsible_name: { type: Type.STRING, description: "Nome do responsável (aceita primeiro nome). Omita para todas as tarefas." },
            title_contains: { type: Type.STRING, description: "Texto que o título da tarefa deve conter (ex: nome de cliente, empreendimento)." },
            status: { type: Type.STRING, format: "enum", enum: ["open", "closed", "all"], description: "open=em aberto (padrão), closed=concluídas/adiadas, all=todas." },
            overdue: { type: Type.BOOLEAN, description: "true = só tarefas com prazo já vencido." },
            due_before: { type: Type.STRING, description: "Data ISO (YYYY-MM-DD) — só tarefas com prazo antes dela." },
            due_after: { type: Type.STRING, description: "Data ISO (YYYY-MM-DD) — só tarefas com prazo depois dela." },
            limit: { type: Type.INTEGER, description: "Quantas tarefas listar (padrão 20, máx 50). O total real sempre vem no campo total." },
          },
        },
      },
      {
        name: "count_tasks",
        description: "Conta tarefas do Bitrix24 com os mesmos filtros de list_tasks. Use quando a pergunta for 'quantas'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            responsible_name: { type: Type.STRING },
            title_contains: { type: Type.STRING },
            status: { type: Type.STRING, format: "enum", enum: ["open", "closed", "all"] },
            overdue: { type: Type.BOOLEAN },
            due_before: { type: Type.STRING },
            due_after: { type: Type.STRING },
          },
        },
      },
      {
        name: "list_crm",
        description:
          "Lista entidades do CRM: contacts (contatos/clientes), leads, deals (negócios do funil), companies (empresas). Use para perguntas sobre clientes, leads, negócios e pipeline.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            entity: { type: Type.STRING, format: "enum", enum: ["contacts", "leads", "deals", "companies"] },
            name: { type: Type.STRING, description: "Filtro por nome/título (parcial)." },
            limit: { type: Type.INTEGER, description: "Padrão 15, máx 50." },
          },
          required: ["entity"],
        },
      },
      {
        name: "get_task",
        description: "Detalhes completos de uma tarefa pelo ID (descrição, responsável, prazo, status).",
        parameters: { type: Type.OBJECT, properties: { id: { type: Type.INTEGER } }, required: ["id"] },
      },
      {
        name: "list_users",
        description: "Lista os usuários da equipe no Bitrix24 (id, nome, ativo).",
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

const SYSTEM_PROMPT = `Você é o SR. Queiroz, assistente interno da equipe FQ Imóveis, conectado ao Bitrix24 em tempo real.
Despojado e profissional, fala pt-BR. REGRAS:
- Você TEM ferramentas de leitura do Bitrix: use-as sempre que a pergunta depender de dados reais. NUNCA invente números, tarefas, clientes ou negócios.
- Chame quantas ferramentas precisar (ex.: count_tasks para "quantas", list_tasks para listar, list_crm para clientes/negócios).
- Se um nome de pessoa for ambíguo, apresente as opções em vez de chutar.
- Sempre informe o TOTAL quando existir (campo total), mesmo listando só os primeiros itens.
- Para CRIAR, CONCLUIR ou ALTERAR registros você não executa direto: oriente o corretor a pedir o comando (ex.: "agenda visita com a Ana sábado 14h", "cadastra o cliente João", "conclui a tarefa 123") — o sistema pede confirmação antes de gravar.
- Responda objetivo, formatando listas com • e datas curtas (dd/mm).`;

type FnArgs = Record<string, unknown>;

const TASK_STATUS: Record<string, string> = { "1": "nova", "2": "pendente", "3": "em andamento", "4": "aguardando", "5": "concluída", "6": "adiada", "7": "recusada" };

async function taskFilters(args: FnArgs) {
  const f: Parameters<typeof queryTasks>[0] = { titleContains: args.title_contains as string | undefined };
  if (args.status === "closed") f.onlyClosed = true;
  if (args.status === "all") f.includeClosed = true;
  if (args.overdue) f.deadlineBefore = new Date();
  if (args.due_before) f.deadlineBefore = new Date(`${args.due_before}T23:59:59-03:00`);
  if (args.due_after) f.deadlineAfter = new Date(`${args.due_after}T00:00:00-03:00`);
  if (args.responsible_name) {
    const candidates = await staffCandidates(String(args.responsible_name));
    if (candidates.length > 1) return { ambiguous: candidates.map((c) => c.name) };
    if (candidates.length === 0) return { error: `Nenhum responsável chamado "${args.responsible_name}" na equipe.` };
    f.responsibleId = candidates[0].bitrixId;
  }
  return { filter: f };
}

async function responsibleName(id: string | undefined, users: Awaited<ReturnType<typeof listBitrixUsers>>) {
  if (!id) return "sem responsável";
  const u = users.find((x) => String(x.ID) === String(id));
  return u ? [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() : `ID ${id}`;
}

function compactTask(t: B24Task, names: Map<string, string>) {
  return {
    id: t.id ?? t.ID,
    title: t.title ?? t.TITLE,
    deadline: t.deadline ?? t.DEADLINE ?? null,
    responsible: names.get(String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "")) ?? "?",
    status: TASK_STATUS[String(t.status ?? t.STATUS ?? "")] ?? t.status ?? t.STATUS,
  };
}

async function execListTasks(args: FnArgs, users: Awaited<ReturnType<typeof listBitrixUsers>>) {
  const resolved = await taskFilters(args);
  if ("ambiguous" in resolved || "error" in resolved) return resolved;
  const all = await queryTasks(resolved.filter, 500);
  const limit = Math.min(Number(args.limit) || 20, 50);
  const names = new Map<string, string>();
  for (const t of all.slice(0, limit)) {
    const rid = String(t.responsibleId ?? t.RESPONSIBLE_ID ?? "");
    if (!names.has(rid)) names.set(rid, await responsibleName(rid, users));
  }
  return { total: all.length, showing: Math.min(limit, all.length), tasks: all.slice(0, limit).map((t) => compactTask(t, names)) };
}

async function execListCrm(args: FnArgs) {
  const entity = String(args.entity);
  const name = args.name ? String(args.name) : undefined;
  const limit = Math.min(Number(args.limit) || 15, 50);
  const cfg: Record<string, { method: string; select: string[]; filterKey: string }> = {
    contacts: { method: "crm.contact.list", select: ["ID", "NAME", "LAST_NAME", "PHONE", "EMAIL"], filterKey: "%NAME" },
    leads: { method: "crm.lead.list", select: ["ID", "TITLE", "NAME", "LAST_NAME", "STATUS_ID", "PHONE"], filterKey: "%NAME" },
    deals: { method: "crm.deal.list", select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "ASSIGNED_BY_ID"], filterKey: "%TITLE" },
    companies: { method: "crm.company.list", select: ["ID", "TITLE"], filterKey: "%TITLE" },
  };
  const c = cfg[entity];
  if (!c) return { error: `Entidade desconhecida: ${entity}` };
  const filter = name ? { [c.filterKey]: name } : {};
  const items = (await b24Call<Record<string, unknown>[]>(c.method, { filter, select: c.select, order: { DATE_MODIFY: "desc" }, start: 0 }).catch((e) => ({ error: e.message }))) as Record<string, unknown>[] | { error: string };
  if (!Array.isArray(items)) return items;
  return { total: items.length, items: items.slice(0, limit) };
}

async function executeTool(name: string, args: FnArgs, users: Awaited<ReturnType<typeof listBitrixUsers>>): Promise<unknown> {
  switch (name) {
    case "list_tasks":
      return execListTasks(args, users);
    case "count_tasks": {
      const resolved = await taskFilters(args);
      if ("ambiguous" in resolved || "error" in resolved) return resolved;
      return { total: (await queryTasks(resolved.filter, 500)).length };
    }
    case "list_crm":
      return execListCrm(args);
    case "get_task": {
      const t = await b24Call<{ task?: Record<string, unknown> } | Record<string, unknown>>("tasks.task.get", { taskId: args.id, select: ["ID", "TITLE", "DEADLINE", "STATUS", "RESPONSIBLE_ID", "DESCRIPTION", "CREATED_DATE"] }).catch((e) => ({ error: e.message }));
      const task = (t as { task?: Record<string, unknown> })?.task ?? t;
      return { ...task, responsible: await responsibleName(String((task as Record<string, unknown>).responsibleId ?? (task as Record<string, unknown>).RESPONSIBLE_ID ?? ""), users) };
    }
    case "list_users": {
      return users.map((u) => ({ id: u.ID, name: [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim(), active: u.ACTIVE !== false }));
    }
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

/** Responde perguntas da equipe com function calling sobre a API real do Bitrix24. */
export async function answerWithBitrixTools(message: string, staff: StaffMember | null): Promise<string | null> {
  const env = serverEnv();
  const ai = genaiClient();
  const users = await listBitrixUsers().catch(() => []);
  const hoje = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });

  const contents: { role: string; parts: Record<string, unknown>[] }[] = [
    { role: "user", parts: [{ text: `Corretor: ${staff?.name ?? "desconhecido"} (Bitrix ID ${staff?.bitrixId ?? "?"})\nData/hora atual: ${hoje}\nPergunta: ${message}` }] },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.2, tools: CRM_TOOLS },
    });
    const cand = res.candidates?.[0];
    const parts = (cand?.content?.parts ?? []) as { text?: string; functionCall?: { name: string; args?: FnArgs } }[];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return res.text?.trim() || null;

    contents.push({ role: "model", parts });
    const fnParts = [] as Record<string, unknown>[];
    for (const c of calls) {
      const out = await executeTool(c.functionCall!.name, c.functionCall!.args ?? {}, users).catch((e) => ({ error: e instanceof Error ? e.message : "erro" }));
      fnParts.push({ functionResponse: { name: c.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: fnParts });
  }
  return "Consultei muitos dados e ainda não consegui fechar a resposta. Pode detalhar melhor o que você quer?";
}
