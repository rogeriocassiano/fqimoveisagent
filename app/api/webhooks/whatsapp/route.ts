import { createHmac, timingSafeEqual } from "node:crypto";

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge);
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!signature || !secret) return new Response("Unauthorized", { status: 401 });
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return new Response("Unauthorized", { status: 401 });
  const payload: unknown = JSON.parse(body);
  console.info("whatsapp_webhook_received", { received: Boolean(payload) });
  return Response.json({ received: true });
}
