const BASE = () => process.env.WA_SERVICE_URL?.replace(/\/$/, "");
const SECRET = () => process.env.WA_SERVICE_SECRET ?? "";

function configured() {
  if (!BASE() || !SECRET()) throw new Error("WA_SERVICE_URL/WA_SERVICE_SECRET não configurados");
}

async function call(path: string, init?: RequestInit) {
  configured();
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-wa-secret": SECRET(), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export function startWaSession(id: string) {
  return call("/sessions", { method: "POST", body: JSON.stringify({ id }) });
}

export function getWaStatus(id: string) {
  return call(`/sessions/${id}/status`);
}

export function getWaQr(id: string) {
  return call(`/sessions/${id}/qr`);
}

export function deleteWaSession(id: string) {
  return call(`/sessions/${id}`, { method: "DELETE" });
}
