import { adminDb } from "./supabase";

export type ConvTurn = { role: "user" | "model"; text: string };

const HISTORY_LIMIT = 14;
const HISTORY_MAX_AGE_MS = 60 * 60 * 1000; // 1h — contexto além disso mais atrapalha que ajuda

/** Últimas trocas da conversa (tabela messages, chaveada por member_id), em ordem cronológica. */
export async function getConvHistory(contactKey: string): Promise<ConvTurn[]> {
  try {
    const since = new Date(Date.now() - HISTORY_MAX_AGE_MS).toISOString();
    const { data } = await adminDb()
      .from("messages")
      .select("role, content, created_at")
      .eq("member_id", contactKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    return ((data ?? []) as { role: string; content: string | null }[])
      .filter((m) => m.content)
      .map((m) => ({ role: (m.role === "assistant" || m.role === "model" ? "model" : "user") as ConvTurn["role"], text: m.content as string }))
      .reverse();
  } catch {
    return [];
  }
}

/** Grava uma troca user/model. Fire-and-forget — nunca derruba o fluxo. */
export function rememberTurn(contactKey: string, role: ConvTurn["role"], text: string): void {
  if (!text?.trim()) return;
  void adminDb()
    .from("messages")
    .insert({ member_id: contactKey, role: role === "model" ? "assistant" : "user", content: text.slice(0, 4000) })
    .then(({ error }) => { if (error) console.error("crm_conv_insert_failed", error.message); });
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
