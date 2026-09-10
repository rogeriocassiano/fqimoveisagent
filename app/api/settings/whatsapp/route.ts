import { NextRequest, NextResponse } from "next/server";

const settings = new Map<string, string>();

export async function POST(req: NextRequest) {
  const { agentId } = await req.json();
  if (!agentId) return NextResponse.json({ error: "agentId obrigatório" }, { status: 400 });
  settings.set("whatsapp_agent_id", agentId);
  return NextResponse.json({ ok: true, agentId });
}

export async function GET() {
  return NextResponse.json({ agentId: settings.get("whatsapp_agent_id") ?? null });
}
