import { getSessionUser, hasAdminAccess } from "@/lib/auth";
import { getWaQr } from "@/lib/wa-service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!hasAdminAccess(user.role)) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id } = await params;
  try {
    const { status, data } = await getWaQr(id);
    if (status === 404) return NextResponse.json({ error: "QR ainda não gerado ou sessão já conectada" }, { status: 404 });
    if (data.qr) return NextResponse.json({ qr: data.qr });
    return NextResponse.json({ error: data.error || "Sem QR" }, { status: status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Serviço WhatsApp indisponível" }, { status: 503 });
  }
}
