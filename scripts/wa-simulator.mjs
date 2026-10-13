#!/usr/bin/env node
// Simulador de WhatsApp — age como o wa-server (Baileys) sem precisar de QR.
// Fala com o mesmo webhook (/api/webhooks/wa-session) e "entrega" a resposta
// do agente no terminal, baixando a mídia em wa-sim-media/.
//
// Uso:
//   npm run wa:sim                          -> conversa interativa
//   npm run wa:sim -- --message "oi"        -> dispara uma mensagem e sai
//   npm run wa:sim -- --agent <uuid>        -> vincula a sessão de teste a um agente
//
// Requer: dev server em http://localhost:3000 (APP_URL para mudar) e .env configurado.

import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

try {
  process.loadEnvFile();
} catch {
  // sem .env — falha mais adiante com mensagem clara
}

const BASE = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const SECRET = process.env.WA_SERVICE_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEDIA_DIR = "wa-sim-media";

function fail(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(1);
}

if (!SECRET) fail("WA_SERVICE_SECRET ausente no .env");
if (!SUPABASE_URL || !SERVICE_KEY) fail("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no .env");

const args = process.argv.slice(2);
const messageIdx = args.indexOf("--message");
const oneShot = messageIdx !== -1 ? args[messageIdx + 1] : null;
const agentIdx = args.indexOf("--agent");
const agentId = agentIdx !== -1 ? args[agentIdx + 1] : null;
const audioIdx = args.indexOf("--audio");
const audioPath = audioIdx !== -1 ? args[audioIdx + 1] : null;

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function ensureSession() {
  const existing = await supabase("GET", "/wa_sessions?select=id,status,phone&phone=eq.simulador&limit=1");
  if (existing?.length) return existing[0];
  const org = await supabase("GET", "/organizations?select=id&limit=1");
  if (!org?.length) fail("Nenhuma organização encontrada no banco");
  const created = await supabase("POST", "/wa_sessions", {
    organization_id: org[0].id,
    status: "connected",
    phone: "simulador",
    ...(agentId ? { agent_id: agentId } : {}),
  });
  return created[0];
}

async function sendWebhook(text, sessionId, audio) {
  const res = await fetch(`${BASE}/api/webhooks/wa-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wa-secret": SECRET },
    body: JSON.stringify({
      type: "message",
      sessionId,
      from: "5531999999999",
      participant: "5531888888888",
      isGroup: true,
      text,
      ...(audio ? { audio: audio.base64, audioMimetype: audio.mimetype } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function fileNameFor(item, index) {
  if (item.fileName) return item.fileName.replace(/[^\w.-]/g, "_");
  const url = new URL(item.url);
  const base = url.pathname.split("/").pop() || "arquivo";
  const withExt = /\.\w+$/.test(base) ? base : `${base}.${item.type === "image" ? "jpg" : "bin"}`;
  return `${item.type}-${index}-${withExt}`.replace(/[^\w.-]/g, "_");
}

const DOWNLOAD_CAP_BYTES = 5 * 1024 * 1024;

async function downloadMedia(media) {
  await mkdir(MEDIA_DIR, { recursive: true });
  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const label = item.type === "image" ? "IMAGEM" : "DOCUMENTO";
    try {
      const res = await fetch(item.url);
      const total = Number(res.headers.get("content-length")) || null;
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      while (received < DOWNLOAD_CAP_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
      }
      try {
        await reader.cancel();
      } catch {
        // stream já encerrado
      }
      const buffer = Buffer.concat(chunks);
      const path = join(MEDIA_DIR, fileNameFor(item, i + 1));
      await writeFile(path, buffer);
      const sizeLabel = total ? `${Math.max(1, Math.round(total / 1024))} KB` : `${Math.max(1, Math.round(received / 1024))} KB+ (stream)`;
      const header = buffer.subarray(0, 4).toString("latin1");
      const isPdf = header.startsWith("%PDF");
      const valid = item.type === "document" ? isPdf : buffer.length > 0;
      console.log(
        `   [${valid ? "ENTREGUE" : "SUSPEITO"}] ${label}: ${path} (${sizeLabel}, ${res.headers.get("content-type") ?? "?"}${item.type === "document" ? `, PDF=${isPdf}` : ""})`,
      );
      if (item.caption) console.log(`              legenda: ${item.caption.replace(/\n/g, " | ")}`);
    } catch (err) {
      console.log(`   [FALHOU] ${label}: ${item.url} -> ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function deliver(data) {
  if (data.reply) console.log(`\n[BOT] ${data.reply}`);
  if (Array.isArray(data.media) && data.media.length) {
    console.log(`\n[BOT] (enviando ${data.media.length} arquivo[s]...)\n`);
    await downloadMedia(data.media);
  } else if (!data.reply) {
    console.log("\n[BOT] (sem resposta)");
  }
}

async function loadAudioArg(path) {
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(path);
  const ext = path.split(".").pop().toLowerCase();
  const mimetype = ext === "mp3" ? "audio/mp3" : ext === "wav" ? "audio/wav" : "audio/ogg";
  return { base64: buffer.toString("base64"), mimetype };
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) fail(`Dev server não responde em ${BASE}/api/health — rode "npm run dev" primeiro`);
  const session = await ensureSession();
  console.log("=== Simulador de WhatsApp - FQ Imóveis ===");
  console.log(`Sessão de teste: ${session.id} (status: ${session.status})`);
  console.log("Fluxo: suas mensagens vão ao webhook como se fossem de um grupo (com @menção).");
  console.log('Comandos: /sair encerra. Peça ex: "manda as fotos do ref 123" ou "manda o PDF do <nome>".\n');

  if (oneShot || audioPath) {
    const audio = audioPath ? await loadAudioArg(audioPath) : null;
    const data = await sendWebhook(oneShot ?? "", session.id, audio);
    await deliver(data);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = () =>
    rl.question("[VOCÊ] ", async (line) => {
      const text = line.trim();
      if (!text) return ask();
      if (text === "/sair") {
        rl.close();
        return;
      }
      try {
        const data = await sendWebhook(text, session.id);
        await deliver(data);
      } catch (err) {
        console.error(`[ERRO] ${err instanceof Error ? err.message : err}`);
      }
      ask();
    });
  ask();
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
