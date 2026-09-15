import sharp from "sharp";
import { mkdir } from "node:fs/promises";

// Gera ícones PWA quadrados a partir do logo (1011x639) sobre fundo escuro.
// Rodar: npx tsx scripts/gen-icons.ts
const BG = "#0f0f0f";
const logo = await sharp("public/logo-fq.png").png().toBuffer();

async function makeIcon(size: number, out: string, paddingRatio: number) {
  const pad = Math.round(size * paddingRatio);
  const resized = await sharp(logo)
    .resize(size - pad * 2, size - pad * 2, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(out);
  console.log("✓", out);
}

await mkdir("public/icons", { recursive: true });
await makeIcon(192, "public/icons/icon-192.png", 0.10);
await makeIcon(512, "public/icons/icon-512.png", 0.10);
await makeIcon(512, "public/icons/maskable-512.png", 0.22);
await makeIcon(180, "public/icons/apple-touch-icon.png", 0.10);
