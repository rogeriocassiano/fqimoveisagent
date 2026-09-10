export function GET() {
  return Response.json({ status: "ok", service: "fq-imoveis-agent", timestamp: new Date().toISOString() });
}
