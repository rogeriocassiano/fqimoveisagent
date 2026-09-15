import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import express from "express";
import QRCode from "qrcode";
import pino from "pino";
import { mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.PORT || 4000;
const SECRET = process.env.WA_SERVICE_SECRET;
const WEBHOOK_URL = process.env.APP_WEBHOOK_URL; // ex: https://fqimoveis.netlify.app/api/webhooks/wa-session
const AUTH_DIR = process.env.AUTH_DIR || (existsSync("/data") ? "/data/auth" : "./auth");

if (!SECRET) console.warn("WA_SERVICE_SECRET nao definido - endpoints abertos!");
if (!WEBHOOK_URL) console.warn("APP_WEBHOOK_URL nao definido - mensagens nao serao respondidas");

const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

/** @type {Map<string, { sock: any, qr: string | null, status: string, phone: string | null }>} */
const sessions = new Map();

async function postStatus(sessionId, status, phone) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wa-secret": SECRET },
      body: JSON.stringify({ type: "status", sessionId, status, phone }),
    });
  } catch (err) {
    logger.error({ err: String(err) }, "post_status_failed");
  }
}

async function postMessage(sessionId, msg) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wa-secret": SECRET },
    body: JSON.stringify(msg),
  });
  return res.json().catch(() => ({}));
}

function extractText(m) {
  const msg = m.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  ).trim();
}

async function startSession(id) {
  const existing = sessions.get(id);
  if (existing && existing.status !== "disconnected") return existing;

  const dir = join(AUTH_DIR, id);
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const session = { sock: null, qr: null, status: "connecting", phone: null };
  sessions.set(id, session);

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("FQ Imoveis"),
    markOnlineOnConnect: false,
  });
  session.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = qr;
      session.status = "qr";
      await postStatus(id, "qr", null);
    }

    if (connection === "open") {
      session.qr = null;
      session.status = "connected";
      session.phone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      logger.info({ id, phone: session.phone }, "session_connected");
      await postStatus(id, "connected", session.phone);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      session.status = "disconnected";
      session.qr = null;

      if (loggedOut) {
        sessions.delete(id);
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        await postStatus(id, "disconnected", null);
      } else {
        // reconecta automaticamente em queda de rede/restart
        setTimeout(() => startSession(id).catch((e) => logger.error({ err: String(e) }, "reconnect_failed")), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid;
        if (!jid || m.key?.fromMe) continue;
        if (jid.endsWith("@g.us") || jid === "status@broadcast") continue;

        const text = extractText(m);
        if (!text) continue;

        const from = jid.split("@")[0];
        const data = await postMessage(id, {
          type: "message",
          sessionId: id,
          from,
          pushName: m.pushName || null,
          text,
        });

        if (data?.reply) {
          await sock.sendMessage(jid, { text: data.reply });
        }
      } catch (err) {
        logger.error({ err: String(err) }, "message_handler_failed");
      }
    }
  });

  return session;
}

async function stopSession(id) {
  const session = sessions.get(id);
  if (session?.sock) {
    try { await session.sock.logout(); } catch { /* ja desconectado */ }
    try { session.sock.end(undefined); } catch { /* ignore */ }
  }
  sessions.delete(id);
  await rm(join(AUTH_DIR, id), { recursive: true, force: true }).catch(() => {});
  await postStatus(id, "disconnected", null);
}

// Restaura sessões salvas no volume ao subir o serviço
async function restoreSessions() {
  await mkdir(AUTH_DIR, { recursive: true });
  const entries = await readdir(AUTH_DIR, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isDirectory()) {
      startSession(e.name).catch((err) => logger.error({ err: String(err), id: e.name }, "restore_failed"));
    }
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (SECRET && req.headers["x-wa-secret"] !== SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

app.get("/sessions", (_req, res) => {
  res.json({
    sessions: [...sessions.entries()].map(([id, s]) => ({ id, status: s.status, phone: s.phone })),
  });
});

app.post("/sessions", async (req, res) => {
  const id = req.body?.id;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id obrigatorio" });
  try {
    const session = await startSession(id);
    res.json({ id, status: session.status });
  } catch (err) {
    logger.error({ err: String(err) }, "start_session_failed");
    res.status(500).json({ error: "falha ao iniciar sessao" });
  }
});

app.get("/sessions/:id/status", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ status: "disconnected" });
  res.json({ status: s.status, phone: s.phone });
});

app.get("/sessions/:id/qr", async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || !s.qr) return res.status(404).json({ error: "Sem QR disponivel" });
  const dataUrl = await QRCode.toDataURL(s.qr, { width: 320, margin: 1 });
  res.json({ qr: dataUrl });
});

app.delete("/sessions/:id", async (req, res) => {
  await stopSession(req.params.id);
  res.json({ ok: true });
});

await restoreSessions();
app.listen(PORT, () => logger.info({ port: PORT, authDir: AUTH_DIR }, "wa_server_up"));
