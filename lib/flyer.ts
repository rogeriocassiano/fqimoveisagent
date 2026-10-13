import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { adminDb } from "./supabase";
import type { Property } from "./whatsapp-media";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const ACCENT = rgb(0.05, 0.35, 0.75);
const TEXT = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.5);
const LIGHT = rgb(0.92, 0.93, 0.95);

function sanitize(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\r/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/…/g, "...")
    .replace(/\u2014/g, "-")
    .replace(/[^\u0000-\u00FF]/g, "")
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 20): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines) return lines;
      }
    }
    if (current) lines.push(current);
    if (lines.length >= maxLines) return lines;
  }
  return lines.slice(0, maxLines);
}

async function fetchPhoto(url: string): Promise<{ bytes: Uint8Array; kind: "jpg" | "png" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const lower = url.toLowerCase();
    if (contentType.includes("png") || lower.endsWith(".png")) return { bytes: new Uint8Array(await res.arrayBuffer()), kind: "png" };
    if (contentType.includes("jpeg") || /\.(jpe?g)(\?|$)/.test(lower)) return { bytes: new Uint8Array(await res.arrayBuffer()), kind: "jpg" };
    return null;
  } catch {
    return null;
  }
}

export async function generatePropertyFlyer(property: Property): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_W - MARGIN * 2;

  let y = PAGE_H - MARGIN;

  const drawText = (text: string, size: number, x: number, useBold = false, color = TEXT) => {
    page.drawText(sanitize(text), { x, y, size, font: useBold ? bold : font, color });
  };

  page.drawText(sanitize("FQ IMOVEIS"), { x: MARGIN, y, size: 10, font: bold, color: ACCENT });
  y -= 30;

  for (const line of wrapText(sanitize(property.title || `Imóvel Ref ${property.reference}`), bold, 18, contentWidth, 2)) {
    drawText(line, 18, MARGIN, true);
    y -= 24;
  }

  const location = [property.neighborhood, property.city].filter(Boolean).join(" - ");
  if (location) {
    drawText(location, 11, MARGIN, false, MUTED);
    y -= 16;
  }
  if (property.address) {
    drawText(property.address, 10, MARGIN, false, MUTED);
    y -= 16;
  }

  y -= 8;
  drawText(`Ref ${property.reference}`, 11, MARGIN, true, ACCENT);
  y -= 20;
  drawText(property.sale_price ? `R$ ${property.sale_price.toLocaleString("pt-BR")}` : "Preço: consulte", 20, MARGIN, true);
  y -= 28;

  const features = [
    property.bedrooms != null ? `${property.bedrooms} quarto${property.bedrooms === 1 ? "" : "s"}` : null,
    property.suites ? `${property.suites} suíte${property.suites === 1 ? "" : "s"}` : null,
    property.bathrooms != null ? `${property.bathrooms} banheiro${property.bathrooms === 1 ? "" : "s"}` : null,
    property.parking_spaces ? `${property.parking_spaces} vaga${property.parking_spaces === 1 ? "" : "s"}` : null,
    property.area ? `${property.area} m²` : null,
    property.type,
  ].filter(Boolean) as string[];
  if (features.length) {
    const line = features.join("  •  ");
    for (const wrapped of wrapText(line, font, 10, contentWidth, 2)) {
      page.drawRectangle({ x: MARGIN - 8, y: y - 4, width: contentWidth + 16, height: 18, color: LIGHT });
      page.drawText(sanitize(wrapped), { x: MARGIN, y, size: 10, font, color: TEXT });
      y -= 26;
    }
  }

  y -= 12;
  const photos = (property.payload?.photos ?? []).slice(0, 4);
  const gridCols = 2;
  const cellW = (contentWidth - 12) / gridCols;
  const cellH = 150;
  const rows = Math.ceil(photos.length / gridCols);
  for (let row = 0; row < rows; row++) {
    const cellTop = y - 12;
    y = cellTop - cellH;
    for (let col = 0; col < gridCols; col++) {
      const index = row * gridCols + col;
      const photo = photos[index];
      if (!photo) continue;
      const fetched = await fetchPhoto(photo);
      if (!fetched) continue;
      const image: PDFImage =
        fetched.kind === "png" ? await doc.embedPng(fetched.bytes) : await doc.embedJpg(fetched.bytes);
      const scale = Math.min(cellW / image.width, cellH / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, {
        x: MARGIN + col * (cellW + 12) + (cellW - w) / 2,
        y: cellTop - cellH + (cellH - h) / 2,
        width: w,
        height: h,
      });
    }
    y -= 8;
  }
  if (photos.length) y -= 16;

  const sections: [string, string | null | undefined][] = [
    ["Sobre o imóvel", property.payload?.description],
    ["Características da unidade", property.payload?.unit_features],
    ["Características do empreendimento", property.payload?.building_features],
  ];
  for (const [heading, body] of sections) {
    if (!sanitize(body)) continue;
    y -= 8;
    drawText(heading, 12, MARGIN, true, ACCENT);
    y -= 16;
    for (const line of wrapText(sanitize(body), font, 10, contentWidth, 12)) {
      drawText(line, 10, MARGIN);
      y -= 14;
    }
  }

  const footerY = MARGIN;
  if (property.url) {
    page.drawText(sanitize(`Anúncio: ${property.url}`), { x: MARGIN, y: footerY + 14, size: 9, font, color: ACCENT });
  }
  page.drawText(sanitize("FQ Imóveis - gerado por SR. Queiroz"), {
    x: MARGIN,
    y: footerY,
    size: 8,
    font,
    color: MUTED,
  });

  return doc.save();
}

export async function createPropertyFlyerUrl(property: Property): Promise<{ url: string; fileName: string }> {
  const bytes = await generatePropertyFlyer(property);
  const safeRef = sanitize(property.reference).replace(/[^\w-]/g, "") || "imovel";
  const path = `flyers/${safeRef}.pdf`;
  const db = adminDb();
  const { error: uploadError } = await db.storage
    .from("documents")
    .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;
  const { data, error: urlError } = await db.storage.from("documents").createSignedUrl(path, 3600);
  if (urlError || !data?.signedUrl) throw urlError ?? new Error("Falha ao gerar URL do flyer");
  return { url: data.signedUrl, fileName: `imovel-${safeRef}.pdf` };
}
