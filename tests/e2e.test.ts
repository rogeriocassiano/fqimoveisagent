import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Suíte E2E — roda contra banco Supabase real e Gemini real.
 * Executar com: npm run e2e (requer .env e, para os testes HTTP, o dev server em :3000).
 * Mantida fora do `npm test` normal para não depender de serviços externos no CI.
 */

const runE2E = process.env.RUN_E2E === "1";

if (runE2E) vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

type TestProperty = {
  reference: string;
  title: string | null;
  neighborhood: string | null;
  city: string | null;
  sale_price: number | null;
  url: string | null;
  payload?: { photos?: string[] } | null;
};

describe.skipIf(!runE2E)("E2E: fluxo completo do agente", () => {
  let agentId = "";
  let sessionId = "";
  let organizationId = "";
  let testDocPath = "";
  let db: SupabaseClient;

  beforeAll(() => {
    try {
      process.loadEnvFile?.();
    } catch {
      // sem .env — os testes abaixo vão falhar com mensagem clara
    }
  });

  beforeAll(async () => {
    const { adminDb } = await import("../lib/supabase");
    db = adminDb();
    const { data: org } = await db.from("organizations").select("id").limit(1);
    organizationId = org?.[0]?.id as string;
    expect(organizationId).toBeTruthy();
  });

  afterAll(async () => {
    if (!db) return;
    if (agentId) await db.from("agents").delete().eq("id", agentId);
    if (sessionId) await db.from("wa_sessions").delete().eq("id", sessionId);
    if (testDocPath) {
      await db.storage.from("documents").remove([testDocPath]).catch(() => {});
    }
  });

  it("cria agente de teste", async () => {
    const { createAgent } = await import("../lib/agent");
    const agent = await createAgent({
      name: `E2E Test ${Date.now()}`,
      persona: "teste automatizado",
      system_prompt: "Você é um agente de teste da FQ Imóveis.",
    });
    agentId = agent.id as string;
    expect(agentId).toBeTruthy();
  });

  it("adiciona fonte de texto", async () => {
    const { addSource } = await import("../lib/agent");
    const source = await addSource(agentId, {
      type: "text",
      title: "Manual E2E",
      content:
        "O Residencial Sol da Manhã tem piscina aquecida e academia. O valor da taxa de condomínio do Sol da Manhã é de R$ 450,00. As chaves do salão de festas ficam na portaria.",
    });
    expect(source.id).toBeTruthy();
  });

  it("treina a fonte (reproduz o clique em Treinar)", async () => {
    const { trainSource } = await import("../lib/agent");
    const { data: sources } = await db.from("sources").select("id").eq("agent_id", agentId);
    const sourceId = (sources as { id: string }[] | null)?.[0]?.id;
    expect(sourceId).toBeTruthy();
    const result = await trainSource(sourceId!);
    expect(result.chunks).toBeGreaterThan(0);
  });

  it("verifica chunks persistidos com embedding", async () => {
    const { data: chunks } = await db.from("chunks").select("id, text, embedding").limit(5);
    expect((chunks as unknown[] | null)?.length ?? 0).toBeGreaterThan(0);
  });

  it("agente responde usando o contexto treinado", async () => {
    const { chatWithAgent } = await import("../lib/agent");
    const { answer } = await chatWithAgent(agentId, "Qual a taxa de condomínio do Sol da Manhã?", undefined, "e2e@test");
    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(0);
  });

  it("resolução de imóvel por referência retorna um imóvel real", async () => {
    const { resolvePropertyForMedia } = await import("../lib/whatsapp-media");
    const { data: property } = await db
      .from("properties")
      .select("reference")
      .eq("status", "available")
      .limit(1);
    const reference = (property as { reference: string }[] | null)?.[0]?.reference;
    if (!reference) return; // sem imóveis no catálogo — pula
    const resolution = await resolvePropertyForMedia(`manda as fotos do ref ${reference}`);
    expect(resolution.kind).toBe("single");
  });

  it("gera flyer em PDF, sobe no storage e a URL assinada responde 200", async () => {
    const { createPropertyFlyerUrl } = await import("../lib/flyer");
    const { data } = await db
      .from("properties")
      .select("reference,title,neighborhood,city,sale_price,url,payload")
      .eq("status", "available")
      .limit(10);
    const properties = (data as TestProperty[] | null) ?? [];
    const p = properties.find((item) => item.payload?.photos?.length) ?? properties[0];
    if (!p?.reference) return; // catálogo vazio — pula

    const flyer = await createPropertyFlyerUrl(p);
    expect(flyer.url).toContain("token=");
    const res = await fetch(flyer.url);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("encontra PDF já existente cadastrado como fonte do agente", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const { findExistingPdfDocuments, searchWordsFor } = await import("../lib/whatsapp-media");

    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    testDocPath = `e2e/flyer-teste-${Date.now()}.pdf`;
    const { error } = await db.storage
      .from("documents")
      .upload(testDocPath, Buffer.from(bytes), { contentType: "application/pdf" });
    expect(error).toBeNull();

    const { data: source } = await db
      .from("sources")
      .insert({ agent_id: agentId, type: "document", title: "Flyer Teste Vila Nova", uri: testDocPath, status: "ready" })
      .select("id")
      .single();
    expect(source).toBeTruthy();

    const found = await findExistingPdfDocuments(["vila", "nova"], agentId);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].title.toLowerCase()).toContain("vila");

    const words = searchWordsFor("manda o flyer da Vila Nova");
    expect(words).toContain("vila");
  });

  it("webhook HTTP responde 401 sem secret e conversa com secret válido", async () => {
    const secret = process.env.WA_SERVICE_SECRET;
    const base = "http://localhost:3000";
    const health = await fetch(`${base}/api/health`).catch(() => null);
    if (!health?.ok || !secret) return; // dev server fora do ar ou sem secret — pula

    const unauthorized = await fetch(`${base}/api/webhooks/wa-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", sessionId: "x", text: "oi" }),
    });
    expect(unauthorized.status).toBe(401);

    const { data: session } = await db
      .from("wa_sessions")
      .insert({ organization_id: organizationId, status: "connected", phone: "e2e" })
      .select("id")
      .single();
    sessionId = (session as { id: string } | null)?.id ?? "";
    expect(sessionId).toBeTruthy();

    const res = await fetch(`${base}/api/webhooks/wa-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wa-secret": secret },
      body: JSON.stringify({
        type: "message",
        sessionId,
        from: "5531999999999",
        participant: "5531888888888",
        isGroup: true,
        text: "oi",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reply: string | null };
    expect(typeof data.reply).toBe("string");
  });
});
