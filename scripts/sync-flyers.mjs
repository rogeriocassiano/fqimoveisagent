#!/usr/bin/env node
// Sincroniza os flyers/PDFs da pasta pública do Google Drive para a tabela `sources`.
// O agente (SR. Queiroz) passa a encontrar e enviar esses PDFs no WhatsApp pelo nome.
//
// Uso: npm run sync:flyers
// Configuração: .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//               FLYERS_DRIVE_FOLDER_ID (opcional — default: pasta FQ Imóveis)
//
// Como funciona:
//   1. Varre a pasta pública do Drive (raiz + subpastas de empreendimentos)
//   2. Registra cada PDF como fonte "document" com título = pasta + nome do arquivo
//      e uri = link de download público do Drive (não copia os arquivos para o Supabase)
//   3. Mantém espelho exato: novos PDFs entram, removidos do Drive são excluídos
// Executar novamente após atualizar a pasta do Drive.

import { setTimeout as sleep } from "node:timers/promises";

try {
  process.loadEnvFile();
} catch {
  // sem .env — falha adiante com mensagem clara
}

const FOLDER_ID = process.env.FLYERS_DRIVE_FOLDER_ID || "1lL2Mew3OlFAZfxBljmA8R43RrtIH6dHa";
const AGENT_NAME = "Central de Flyers (Drive)";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOLDER_DELAY_MS = 120;

function fail(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_KEY) fail("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no .env");

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
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

async function fetchEmbedView(folderId) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.text();
    } catch {
      // retry
    }
    await sleep(500 * attempt);
  }
  throw new Error(`Falha ao listar pasta ${folderId} do Drive`);
}

function parseEntries(html) {
  const entries = [];
  const chunks = html.split('<div class="flip-entry" id="entry-').slice(1);
  for (const chunk of chunks) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    if (!id) continue;
    const isFolder = chunk.includes("/drive/folders/");
    const titleMatch = chunk.match(/flip-entry-title">([^<]*)<\/div>/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    if (title) entries.push({ id, title, isFolder });
  }
  return entries;
}

async function listFolder(folderId) {
  return parseEntries(await fetchEmbedView(folderId));
}

function driveDownloadUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

function normalizeSearchTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isPdf(title) {
  return title.toLowerCase().endsWith(".pdf");
}

async function scanDrive() {
  const rootEntries = await listFolder(FOLDER_ID);
  const pdfs = [];
  let skipped = 0;
  let folderCount = 0;

  for (const entry of rootEntries) {
    if (entry.isFolder) {
      folderCount++;
      const subEntries = await listFolder(entry.id);
      for (const file of subEntries) {
        if (file.isFolder || !isPdf(file.title)) {
          skipped++;
          continue;
        }
        const nameNoExt = file.title.replace(/\.pdf$/i, "");
        pdfs.push({ driveId: file.id, title: `${entry.title} - ${nameNoExt}`, fileName: file.title });
      }
      await sleep(FOLDER_DELAY_MS);
    } else if (isPdf(entry.title)) {
      pdfs.push({ driveId: entry.id, title: entry.title.replace(/\.pdf$/i, ""), fileName: entry.title });
    } else {
      skipped++;
    }
  }

  return { pdfs, skipped, folderCount };
}

async function ensureCentralAgent() {
  const found = await supabase("GET", `/agents?select=id,name&name=eq.${encodeURIComponent(AGENT_NAME)}`);
  if (found?.length) return found[0].id;
  const org = await supabase("GET", "/organizations?select=id&limit=1");
  if (!org?.length) fail("Nenhuma organização encontrada no banco");
  const created = await supabase("POST", "/agents", {
    organization_id: org[0].id,
    name: AGENT_NAME,
    persona: "Catálogo de flyers e PDFs sincronizados do Google Drive",
    tone: "",
    status: "ready",
  });
  return created[0].id;
}

async function syncSources(pdfs) {
  const agentId = await ensureCentralAgent();
  const existing = await supabase("GET", `/sources?select=id,title,uri,agent_id,metadata&agent_id=eq.${agentId}&type=eq.document&limit=2000`);
  const byDriveId = new Map(
    (existing ?? [])
      .filter((s) => s.metadata?.drive_file_id)
      .map((s) => [s.metadata.drive_file_id, s]),
  );

  const now = new Date().toISOString();
  const scannedIds = new Set();
  const toInsert = [];
  const toUpdate = [];
  let unchanged = 0;

  for (const pdf of pdfs) {
    scannedIds.add(pdf.driveId);
    const uri = driveDownloadUrl(pdf.driveId);
    const metadata = { drive_file_id: pdf.driveId, search_title: normalizeSearchTitle(pdf.title), synced_at: now };
    const row = byDriveId.get(pdf.driveId);
    if (!row) {
      toInsert.push({ agent_id: agentId, type: "document", title: pdf.title, uri, status: "ready", metadata });
    } else if (
      row.title !== pdf.title ||
      row.uri !== uri ||
      row.metadata?.search_title !== metadata.search_title
    ) {
      toUpdate.push({ id: row.id, title: pdf.title, uri, metadata });
    } else {
      unchanged++;
    }
  }

  const removedIds = [...byDriveId.values()].filter((s) => !scannedIds.has(s.metadata.drive_file_id)).map((s) => s.id);

  for (let i = 0; i < toInsert.length; i += 100) {
    await supabase("POST", "/sources", toInsert.slice(i, i + 100));
  }
  for (const update of toUpdate) {
    await supabase("PATCH", `/sources?id=eq.${update.id}`, { title: update.title, uri: update.uri, metadata: update.metadata });
  }
  for (let i = 0; i < removedIds.length; i += 50) {
    const ids = removedIds.slice(i, i + 50).map((id) => `"${id}"`).join(",");
    await supabase("DELETE", `/sources?id=in.(${ids})`);
  }

  return { agentId, inserted: toInsert.length, updated: toUpdate.length, removed: removedIds.length, unchanged };
}

async function main() {
  console.log("=== Sync de Flyers - Google Drive -> Supabase ===");
  console.log(`Pasta: https://drive.google.com/drive/folders/${FOLDER_ID}\n`);
  console.log("Varrendo Drive (raiz + subpastas)...");
  const { pdfs, skipped, folderCount } = await scanDrive();
  console.log(`Pastas: ${folderCount} | PDFs: ${pdfs.length} | não-PDF ignorados: ${skipped}\n`);

  const result = await syncSources(pdfs);
  console.log("Resultado do sync:");
  console.log(`  - Agente: ${AGENT_NAME} (${result.agentId})`);
  console.log(`  - Novos: ${result.inserted}`);
  console.log(`  - Atualizados: ${result.updated}`);
  console.log(`  - Removidos (não estão mais no Drive): ${result.removed}`);
  console.log(`  - Inalterados: ${result.unchanged}`);
  console.log("\nPronto. O SR. Queiroz já pode enviar esses PDFs no WhatsApp (ex: 'manda o PDF do Place Caçara').");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
