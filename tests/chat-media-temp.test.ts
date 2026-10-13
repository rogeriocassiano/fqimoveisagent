import { describe, expect, it } from "vitest";
import { findExistingPdfDocuments, listPropertyOptions, searchWordsFor } from "../lib/whatsapp-media";

describe.skip("mídia no chat web (requer ambiente E2E)", () => {
  it("encontra PDFs reais do Leonardo Da Vinci", async () => {
    const docs = await findExistingPdfDocuments(searchWordsFor("me manda o flyer do Leonardo Da Vinci"));
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].title).toMatch(/Leonardo Da Vinci/i);
    expect(docs[0].path).toMatch(/^https:\/\//);
  }, 30000);

  it("encontra imóveis reais por bairro", async () => {
    const properties = await listPropertyOptions(searchWordsFor("tem apartamento no betania?"));
    expect(properties.some((property) => property.reference === "150")).toBe(true);
  }, 30000);
});
