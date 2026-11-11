import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCrmContext, detectCrmQueryIntent, detectStaffIntent, findStaffByName, isConfirmation, normalizePhone } from "../lib/bitrix";

describe("normalizePhone", () => {
  it("extrai apenas dígitos", () => {
    expect(normalizePhone("5531999887766@c.us")).toBe("5531999887766");
    expect(normalizePhone("+55 (31) 99988-7766")).toBe("5531999887766");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("detectStaffIntent", () => {
  it("detecta pedido de visita", () => {
    expect(detectStaffIntent("agenda visita com a Ana sábado 14h no Neo Pampulha")).toBe(true);
    expect(detectStaffIntent("marcar uma visita pro cliente João amanhã")).toBe(true);
    expect(detectStaffIntent("agendar visita hoje às 16h")).toBe(true);
  });
  it("detecta cadastro de cliente", () => {
    expect(detectStaffIntent("cadastra o cliente Ana, tel 31999998888")).toBe(true);
    expect(detectStaffIntent("cadastrar um lead novo")).toBe(true);
  });
  it("não dispara em conversa comum", () => {
    expect(detectStaffIntent("quais apartamentos vocês têm na pampulha?")).toBe(false);
    expect(detectStaffIntent("me manda as fotos do ref 72")).toBe(false);
  });
});

describe("isConfirmation", () => {
  it("aceita confirmações comuns", () => {
    for (const t of ["sim", "Sim", "isso", "confirma", "pode", "ok", "bora"]) {
      expect(isConfirmation(t)).toBe(true);
    }
  });
  it("rejeita outras respostas", () => {
    expect(isConfirmation("não")).toBe(false);
    expect(isConfirmation("muda a data pra sexta")).toBe(false);
  });
});

// ── Consulta ao CRM (mock do fetch do Bitrix) ─────────────────────────────────

function mockBitrix() {
  process.env.B24_WEBHOOK_URL = "https://b24.test/rest/1/abc/";
  const users = [
    { ID: "92", NAME: "Aline ", LAST_NAME: "Cordeiro", ACTIVE: true },
    { ID: "24", NAME: "Silvana", LAST_NAME: "Paiva", ACTIVE: true },
  ];
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const tasks = [
    { id: "21822", title: "Consultoria Agendada - Valquíria", deadline: past, responsibleId: "92", status: "2" },
    { id: "111", title: "Visita futura", deadline: future, responsibleId: "92", status: "3" },
    { id: "222", title: "Tarefa concluída", deadline: past, responsibleId: "24", status: "5" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const result = url.includes("user.get")
        ? users
        : url.includes("tasks.task.list")
          ? { tasks: tasks.filter((t) => !body.filter?.RESPONSIBLE_ID || String(t.responsibleId) === String(body.filter.RESPONSIBLE_ID)) }
          : [];
      return new Response(JSON.stringify({ result }), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("findStaffByName", () => {
  it("encontra funcionário mesmo com espaços extras no nome do Bitrix", async () => {
    mockBitrix();
    expect((await findStaffByName("aline cordeiro"))?.bitrixId).toBe(92);
  });
});

describe("buildCrmContext", () => {
  it("lista tarefas atrasadas de um corretor citado", async () => {
    mockBitrix();
    const ctx = await buildCrmContext("você consegue olhar uma tarefa atrasada da aline cordeiro?", null);
    expect(ctx).toContain("Aline Cordeiro");
    expect(ctx).toContain("Consultoria Agendada - Valquíria");
    expect(ctx).not.toContain("Visita futura");
    expect(ctx).not.toContain("Tarefa concluída");
  });
});

describe("detectCrmQueryIntent", () => {
  it("detecta perguntas de tarefas/CRM", () => {
    expect(detectCrmQueryIntent("tarefa atrasada da aline")).toBe(true);
    expect(detectCrmQueryIntent("minhas tarefas")).toBe(true);
    expect(detectCrmQueryIntent("quanto custa o apartamento?")).toBe(false);
  });
});
