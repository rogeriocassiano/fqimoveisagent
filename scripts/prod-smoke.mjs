// Smoke test E2E contra PRODUÇÃO: dispara mensagens como o wa-server faria
// e valida respostas + mídias entregues. Uso:
//   WA_SERVICE_SECRET=xxx node scripts/prod-smoke.mjs
//   WA_SERVICE_SECRET=xxx node scripts/prod-smoke.mjs --local   (testa localhost:3000)

const BASE = process.argv.includes("--local") ? "http://localhost:3000" : "https://fq-imoveis.netlify.app";
const SECRET = process.env.WA_SERVICE_SECRET;
const SESSION = "cbe5e16b-bc59-4127-9c36-7bc94426e483"; // wa_sessions (phone="simulador")

if (!SECRET) {
  console.error("Defina WA_SERVICE_SECRET no ambiente");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (cond) pass++;
  else fail++;
};

async function send(text, { isGroup = false, participant = null, audio = null, audioMimetype = null } = {}) {
  const body = {
    type: "message", sessionId: SESSION, from: "5531900000000",
    isGroup, participant, pushName: "Corretor Teste", text, audio, audioMimetype,
  };
  const res = await fetch(`${BASE}/api/webhooks/wa-session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-wa-secret": SECRET },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function checkMedia(media) {
  const results = [];
  for (const m of media ?? []) {
    try {
      const res = await fetch(m.url, { headers: { Range: "bytes=0-512" } });
      const buf = Buffer.from(await res.arrayBuffer());
      const isPdf = buf.slice(0, 5).toString("latin1") === "%PDF-";
      const isImg = buf[0] === 0xff && buf[1] === 0xd8; // JPEG
      results.push({ ...m, status: res.status, valid: isPdf || isImg, kind: isPdf ? "PDF" : isImg ? "JPEG" : "?" });
    } catch (e) {
      results.push({ ...m, status: 0, valid: false, kind: "erro: " + e.message });
    }
  }
  return results;
}

function printMedia(list) {
  for (const m of list) {
    console.log(`      [${m.type}] ${m.fileName ?? m.url.slice(0, 70)} -> HTTP ${m.status} ${m.kind}`);
  }
}

// WAV de 1s (tom 440Hz) — valida pipeline de áudio (transcrição chega no Gemini)
function makeWav() {
  const rate = 16000, n = rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.sin(2 * Math.PI * 440 * (i / rate)) * 8000, i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ");
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]).toString("base64");
}

console.log(`\n== Smoke test: ${BASE} ==\n`);

// 1. mídia por ref
let r = await send("manda as fotos do ref 72");
let media = await checkMedia(r.media);
ok("ref 72 -> reply", /Place Caiçara|Ref 72/i.test(r.reply ?? ""));
ok("ref 72 -> envia foto", media.some((m) => m.type === "image" && m.valid));
ok("ref 72 -> envia PDF do Drive", media.some((m) => m.type === "document" && m.kind === "PDF"));
printMedia(media);

// 2. bairros
for (const hood of ["caiçara", "betania", "pampulha", "contagem"]) {
  r = await send(`tem apartamento no ${hood}?`);
  media = await checkMedia(r.media);
  const found = /op[çc][õo]es|Ref \d+/i.test(r.reply ?? "") && !/Não tenho/i.test(r.reply ?? "");
  ok(`bairro "${hood}" -> opções`, found, (r.reply ?? "").split("\n")[0]);
  printMedia(media.slice(0, 2));
}

// 3. região
r = await send("tem apartamento na região do barreiro?");
media = await checkMedia(r.media);
ok("região barreiro -> opções", !/Não tenho/i.test(r.reply ?? ""), (r.reply ?? "").split("\n")[0]);
printMedia(media.slice(0, 2));

// 4. listar tudo
r = await send("quais apartamentos vocês têm disponíveis?");
ok("listar tudo -> catálogo", /im[óo]veis dispon[íi]veis|op[çc][õo]es/i.test(r.reply ?? ""), (r.reply ?? "").split("\n")[0]);

// 5. ambiguidade -> escolha pendente -> resolve
r = await send("me fala do sensia");
const askedChoice = /mais de um|qual deles/i.test(r.reply ?? "") || /Sensia/i.test(r.reply ?? "");
ok("ambiguidade -> resposta sobre Sensia", askedChoice, (r.reply ?? "").split("\n")[0]);
if (/mais de um/i.test(r.reply ?? "")) {
  r = await send("o solarium");
  ok("escolha pendente -> resolve 'o solarium'", /solarium/i.test(r.reply ?? ""));
}

// 6. grupo simulado (participant != from)
r = await send("tem apartamento no caiçara?", { isGroup: true, participant: "5531911111111" });
ok("grupo -> responde com participant", !!r.reply, (r.reply ?? "").split("\n")[0]);

// 7. áudio (pipeline de transcrição)
r = await send("", { audio: makeWav(), audioMimetype: "audio/wav" });
ok("audio -> responde após transcrição", !!r.reply, (r.reply ?? "").split("\n")[0]);

// 8. sem secret -> 401
{
  const res = await fetch(`${BASE}/api/webhooks/wa-session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "message", sessionId: SESSION, text: "oi" }),
  });
  ok("sem secret -> 401", res.status === 401);
}

console.log(`\n== ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail ? 1 : 0);
