import { adminDb } from "./supabase";

export type ConvTurn = { role: "user" | "model"; text: string };

const HISTORY_LIMIT = 14;
const HISTORY_MAX_AGE_MS = 60 * 60 * 1000; // 1h — contexto além disso mais atrapalha que ajuda

type Db = ReturnType<typeof adminDb>;

async function ensureConversation(db: Db, contactKey: string, channel: string, agentId: string | null): Promise<string | null> {
  const { data } = await db
    .from("conversations")
    .select("id")
    .eq("channel", channel)
    .eq("contact_id", contactKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  if (!agentId) return null;
  const { data: created, error } = await db
    .from("conversations")
    .insert({ agent_id: agentId, channel, contact_id: contactKey, status: "open" })
    .select("id")
    .single();
  if (error) { console.error("crm_conv_create_failed", error.message); return null; }
  return created?.id as string;
}

/** Últimas trocas da conversa, em ordem cronológica. Best-effort: falha vira []. */
export async function getConvHistory(contactKey: string, channel = "wa"): Promise<ConvTurn[]> {
  try {
    const db = adminDb();
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("channel", channel)
      .eq("contact_id", contactKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv?.id) return [];
    const since = new Date(Date.now() - HISTORY_MAX_AGE_MS).toISOString();
    const { data } = await db
      .from("messages")
      .select("role, text")
      .eq("conversation_id", conv.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const turns = ((data ?? []) as { role: string; text: string | null }[])
      .filter((m) => m.text)
      .map((m) => ({ role: (m.role === "assistant" ? "model" : m.role) as ConvTurn["role"], text: m.text as string }));
    return turns.reverse();
  } catch {
    return [];
  }
}

/** Grava uma troca user/model. Fire-and-forget — nunca derruba o fluxo. */
export function rememberTurn(contactKey: string, channel: string, agentId: string | null, role: ConvTurn["role"], text: string): void {
  if (!text?.trim()) return;
  void (async () => {
    try {
      const db = adminDb();
      const convId = await ensureConversation(db, contactKey, channel, agentId);
      if (!convId) return;
      await db.from("messages").insert({ conversation_id: convId, role: role === "model" ? "assistant" : role, text: text.slice(0, 4000) });
    } catch (e) {
      console.error("crm_conv_insert_failed", e instanceof Error ? e.message : "unknown");
    }
  })();
}

/** Auditoria de ações de escrita no Bitrix (confirmadas pelo corretor). */
export function logCrmAction(entry: {
  organizationId: string | null;
  contactKey: string;
  staffBitrixId?: string;
  staffName?: string;
  kind: string;
  payload?: unknown;
  result?: unknown;
  status?: "ok" | "error" | "cancelled";
}): void {
  if (!entry.organizationId) return;
  void adminDb()
    .from("audit_log")
    .insert({
      organization_id: entry.organizationId,
      action: "crm_write",
      entity: "bitrix",
      diff: {
        kind: entry.kind,
        contact: entry.contactKey,
        staff: { id: entry.staffBitrixId ?? null, name: entry.staffName ?? null },
        payload: entry.payload ?? null,
        result: entry.result ?? null,
        status: entry.status ?? "ok",
      },
    })
    .then(({ error }) => { if (error) console.error("crm_action_log_failed", error.message); });
}
