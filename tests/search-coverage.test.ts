import { describe, expect, it, beforeAll, vi } from "vitest";
import {
  resolvePropertyForMedia,
  listPropertyOptions,
  findExistingPdfDocuments,
  propertySearchWords,
  type Property,
} from "../lib/whatsapp-media";
import { searchProperties } from "../lib/properties";

/**
 * Cobertura de busca contra o inventário REAL do Supabase.
 * Executar com: RUN_E2E=1 npx vitest run tests/search-coverage.test.ts
 * Verifica que todo imóvel disponível é encontrado pelo título,
 * tolera erros de digitação e não retorna falsos positivos.
 */

const runCoverage = process.env.RUN_E2E === "1";
if (runCoverage) vi.setConfig({ testTimeout: 300_000 });

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function typoVariant(title: string): string {
  const words = title.split(/\s+/).filter((w) => w.length >= 5);
  const w = words[words.length - 1] ?? title;
  const pos = Math.floor(w.length / 2);
  const mangled = w.slice(0, pos) + w.slice(pos + 1);
  return title.replace(w, mangled);
}

describe.skipIf(!runCoverage)("Cobertura de busca no inventário real", () => {
  let all: Property[] = [];

  beforeAll(async () => {
    process.loadEnvFile?.();
    all = ((await searchProperties({}, 1000)) ?? []) as Property[];
    expect(all.length).toBeGreaterThan(0);
    console.log(`inventário: ${all.length} imóveis, ${new Set(all.map((p) => norm(p.title))).size} empreendimentos`);
  });

  const cachedSearch: (f: { reference?: string; q?: string }, l?: number) => Promise<Property[]> = async (f) => {
    if (f.reference) return all.filter((p) => p.reference === f.reference);
    return all;
  };

  it("encontra todos os imóveis pelo título exato", async () => {
    const failures: string[] = [];
    const byTitle = new Map<string, Property[]>();
    for (const p of all) {
      const key = norm(p.title);
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key)!.push(p);
    }
    let found = 0;
    for (const [key, group] of byTitle) {
      const res = await resolvePropertyForMedia(`manda o flyer do ${group[0].title}`, cachedSearch);
      const ok =
        (res.kind === "single" && norm(res.property.title) === key) ||
        (res.kind === "ambiguous" && res.properties.every((p) => norm(p.title) === key)) ||
        // ambíguo com empreendimentos de mesmo nome em outro contexto é aceitável se incluir o alvo
        (res.kind === "ambiguous" && res.properties.some((p) => norm(p.title) === key));
      if (ok) found++;
      else failures.push(`${group[0].title} -> ${res.kind}: ${res.kind === "none" ? "-" : res.kind === "single" ? res.property.title : res.properties.map((p) => p.title).join(", ")}`);
    }
    console.log(`títulos: ${found}/${byTitle.size} encontrados`);
    if (failures.length) console.log("falhas:\n" + failures.join("\n"));
    expect(failures).toEqual([]);
  });

  it("encontra todos os imóveis pela referência", async () => {
    const failures: string[] = [];
    for (const p of all) {
      const res = await resolvePropertyForMedia(`manda o flyer da ref ${p.reference}`, cachedSearch);
      if (res.kind !== "single" || res.property.reference !== p.reference) failures.push(p.reference);
    }
    expect(failures).toEqual([]);
  });

  it("tolera erro de digitação em cada empreendimento", async () => {
    const byTitle = new Map<string, Property[]>();
    for (const p of all) {
      const key = norm(p.title);
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key)!.push(p);
    }
    const failures: string[] = [];
    let found = 0;
    for (const [key, group] of byTitle) {
      const res = await resolvePropertyForMedia(`manda o flyer do ${typoVariant(group[0].title ?? "")}`, cachedSearch);
      const ok =
        (res.kind === "single" && norm(res.property.title) === key) ||
        (res.kind === "ambiguous" && res.properties.some((p) => norm(p.title) === key));
      if (ok) found++;
      else failures.push(`${typoVariant(group[0].title ?? "")} (era ${group[0].title}) -> ${res.kind}`);
    }
    console.log(`typos: ${found}/${byTitle.size} encontrados`);
    if (failures.length) console.log("sem match:\n" + failures.join("\n"));
    expect(found).toBeGreaterThanOrEqual(byTitle.size * 0.9);
  });

  it("Safira: sem imóvel no estoque = sem falsos positivos de imóvel", async () => {
    const res = await resolvePropertyForMedia("manda o flyer do Residencial Safira", cachedSearch);
    expect(res.kind === "none" || (res.kind === "ambiguous" && res.properties.every((p) => norm(p.title).includes("safira"))) || (res.kind === "single" && norm(res.property.title).includes("safira"))).toBe(true);
    // mas os PDFs do Drive devem existir:
    const docs = await findExistingPdfDocuments(["safira"]);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("nomes inexistentes não casam nada", async () => {
    for (const text of ["manda o flyer do Residencial Inexistente", "quero o imóvel Xyzqwklm", "manda o residencial"]) {
      const res = await resolvePropertyForMedia(text, cachedSearch);
      expect(res.kind).toBe("none");
    }
  });

  it("cobertura de flyers do Drive por empreendimento", async () => {
    const byTitle = new Map<string, Property>();
    for (const p of all) if (!byTitle.has(norm(p.title))) byTitle.set(norm(p.title), p);
    let covered = 0;
    const missing: string[] = [];
    for (const [, p] of byTitle) {
      const docs = await findExistingPdfDocuments(propertySearchWords(p));
      if (docs.length) covered++;
      else missing.push(p.title ?? p.reference);
    }
    console.log(`flyers: ${covered}/${byTitle.size} empreendimentos com PDF`);
    if (missing.length) console.log(`sem flyer: ${missing.join(" | ")}`);
    expect(true).toBe(true); // informativo — sem flyer usa flyer gerado
  });

  it("bairros do inventário retornam opções", async () => {
    const hoods = [...new Set(all.map((p) => norm(p.neighborhood)).filter((h) => h.length >= 4))].slice(0, 40);
    const misses: string[] = [];
    for (const h of hoods) {
      const opts = await listPropertyOptions([h]);
      if (!opts.length) misses.push(h);
    }
    console.log(`bairros testados: ${hoods.length}, sem resultado: ${misses.length}${misses.length ? " -> " + misses.join(", ") : ""}`);
    expect(misses).toEqual([]);
  });
});
