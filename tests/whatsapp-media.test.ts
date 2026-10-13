import { describe, expect, it } from "vitest";
import { generatePropertyFlyer } from "../lib/flyer";
import {
  detectAvailabilityIntent,
  detectMediaIntent,
  describeProperty,
  isCapabilityQuestion,
  listPropertyOptions,
  matchChoice,
  propertyCaption,
  regionExpansion,
  resolvePropertyForMedia,
  type Property,
} from "../lib/whatsapp-media";

const buriti: Property = {
  reference: "123",
  title: "Residencial Buriti",
  neighborhood: "Buriti",
  city: "Belo Horizonte",
  address: "Rua das Palmeiras, 100",
  bedrooms: 3,
  suites: 1,
  bathrooms: 2,
  parking_spaces: 1,
  area: 84,
  sale_price: 850000,
  url: "https://fqimoveis.com.br/imovel/123",
  payload: { photos: ["https://example.com/foto1.jpg"], description: "Apartamento amplo" },
};

describe("detectMediaIntent", () => {
  it("detecta pedidos de fotos e arquivos", () => {
    expect(detectMediaIntent("manda as fotos do ref 123")).toBe(true);
    expect(detectMediaIntent("envia o pdf do apartamento")).toBe(true);
    expect(detectMediaIntent("manda o material do Buriti")).toBe(true);
    expect(detectMediaIntent("quero ver as plantas do apto")).toBe(true);
    expect(detectMediaIntent("manda as imagens")).toBe(true);
    expect(detectMediaIntent("me manda o Leonardo Da Vinci")).toBe(true);
    expect(detectMediaIntent("quero o imóvel Leonardo Da Vinci")).toBe(true);
  });

  it("não detecta em perguntas comuns", () => {
    expect(detectMediaIntent("qual o preço do apartamento?")).toBe(false);
    expect(detectMediaIntent("bom dia pessoal")).toBe(false);
    expect(detectMediaIntent("o Buriti ainda está disponível?")).toBe(false);
  });
});

describe("detectAvailabilityIntent", () => {
  it("detecta perguntas de disponibilidade por bairro", () => {
    expect(detectAvailabilityIntent("tem apartamento no caiçara?")).toBe(true);
    expect(detectAvailabilityIntent("temos algum imóvel na betânia?")).toBe(true);
    expect(detectAvailabilityIntent("quais as opções de apartamento no Buriti?")).toBe(true);
  });

  it("não detecta em outros casos", () => {
    expect(detectAvailabilityIntent("manda as fotos do ref 123")).toBe(false);
    expect(detectAvailabilityIntent("bom dia")).toBe(false);
    expect(detectAvailabilityIntent("quantos quartos tem o apartamento?")).toBe(false);
  });
});

describe("isCapabilityQuestion", () => {
  it("detecta perguntas sobre o que o bot consegue fazer", () => {
    expect(isCapabilityQuestion("você consegue mandar fotos?")).toBe(true);
    expect(isCapabilityQuestion("vc pode enviar pdf?")).toBe(true);
  });

  it("não detecta pedidos diretos", () => {
    expect(isCapabilityQuestion("manda as fotos do ref 123")).toBe(false);
  });
});

describe("listPropertyOptions", () => {
  const solarium: Property = { ...buriti, reference: "119", title: "Sensia Solarium", neighborhood: "Cabral" };
  const options: Property[] = [buriti, solarium];

  it("encontra imóveis por bairro com acento tolerante", async () => {
    const result = await listPropertyOptions(["caicara"], async () => [
      { ...buriti, neighborhood: "Alto Caiçaras" },
      solarium,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].neighborhood).toBe("Alto Caiçaras");
  });

  it("prioriza imóvel que casa com todas as palavras", async () => {
    const result = await listPropertyOptions(["sensia", "solarium"], async () => options);
    expect(result[0].reference).toBe("119");
  });

  it("encontra por endereço e descrição (bairro fora do título)", async () => {
    const betania: Property = { ...buriti, reference: "200", title: "Ed. Monte Verde", address: "Rua X, Betânia", neighborhood: "" };
    const result = await listPropertyOptions(["betania"], async () => [betania, buriti]);
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("200");
  });

  it("modo parcial (região) aceita hits em qualquer bairro", async () => {
    const a: Property = { ...buriti, reference: "1", title: "A", address: "Rua A, Betânia" };
    const b: Property = { ...buriti, reference: "2", title: "B", address: "Rua B, Alto Caiçaras" };
    const result = await listPropertyOptions(["betania", "caicara"], async () => [a, b], true);
    expect(result).toHaveLength(2);
  });
});

describe("regionExpansion", () => {
  it("expande região para bairros", () => {
    const hoods = regionExpansion("tem apartamento na região do barreiro?");
    expect(hoods).toContain("barreiro");
    expect(hoods).toContain("milionarios");
    expect(hoods).toContain("diamante");
  });

  it("expande região de duas palavras", () => {
    expect(regionExpansion("tem algo na região centro-sul?")).toContain("savassi");
    expect(regionExpansion("algo no centro sul")).toContain("lourdes");
  });

  it("não expande bairro comum que não é região", () => {
    expect(regionExpansion("tem apartamento no caiçara?")).toHaveLength(0);
    expect(regionExpansion("tem apartamento no centro?")).toHaveLength(0);
  });
});

describe("matchChoice", () => {
  const solarium: Property = { ...buriti, reference: "119", title: "Sensia Solarium" };
  const serra: Property = { ...buriti, reference: "136", title: "Sensia Serra" };
  const options = [solarium, serra];

  it("resolve a escolha do corretor pelo nome", () => {
    const matched = matchChoice("o Solarium", options);
    expect(matched).toHaveLength(1);
    expect(matched[0].reference).toBe("119");
  });

  it("resolve a escolha pela ref", () => {
    const matched = matchChoice("136", options);
    expect(matched).toHaveLength(1);
    expect(matched[0].reference).toBe("136");
  });

  it("não força escolha quando a resposta não casa com nada", () => {
    expect(matchChoice("outro assunto qualquer", options)).toHaveLength(0);
  });
});

describe("resolvePropertyForMedia", () => {
  const searchByRef = async (filters: { reference?: string; q?: string }) => {
    if (filters.reference) return filters.reference === "123" ? [buriti] : [];
    if (filters.q === "buriti" || filters.q === "residencial") return [buriti];
    return [];
  };

  it("resolve por referência explícita", async () => {
    const result = await resolvePropertyForMedia("manda as fotos do ref 123", searchByRef);
    expect(result).toMatchObject({ kind: "single" });
    if (result.kind === "single") expect(result.property.reference).toBe("123");
  });

  it("retorna none quando a referência não existe", async () => {
    const result = await resolvePropertyForMedia("fotos do ref 999", searchByRef);
    expect(result.kind).toBe("none");
  });

  it("resolve por nome do empreendimento", async () => {
    const result = await resolvePropertyForMedia("envia as fotos do Residencial Buriti", searchByRef);
    expect(result).toMatchObject({ kind: "single" });
  });

  it("retorna ambiguous com vários matches", async () => {
    const other: Property = { ...buriti, reference: "456", title: "Buriti II" };
    const search = async (filters: { reference?: string; q?: string }) => {
      if (filters.reference) return filters.reference === "123" ? [buriti] : [];
      return [buriti, other];
    };
    const result = await resolvePropertyForMedia("manda as fotos do Buriti", search);
    expect(result.kind).toBe("ambiguous");
  });

  it("prioriza imóvel que casa com todas as palavras (interseção)", async () => {
    const serra: Property = { ...buriti, reference: "136", title: "Sensia Serra" };
    const solarium: Property = { ...buriti, reference: "119", title: "Sensia Solarium" };
    const search = async (filters: { reference?: string; q?: string }) => {
      if (filters.reference) return [];
      if (filters.q === "sensia") return [solarium, serra];
      return [solarium];
    };
    const result = await resolvePropertyForMedia("manda o pdf do Sensia Solarium", search);
    expect(result).toMatchObject({ kind: "single" });
    if (result.kind === "single") expect(result.property.reference).toBe("119");
  });

  it("retorna none sem candidato de imóvel", async () => {
    const result = await resolvePropertyForMedia("manda as fotos", searchByRef);
    expect(result.kind).toBe("none");
  });

  it("ignora palavra genérica residencial e não retorna falsos candidatos", async () => {
    const search = async (filters: { reference?: string; q?: string }) => {
      if (filters.q === "residencial") return [buriti];
      return [];
    };
    const result = await resolvePropertyForMedia("manda o flyer do Residencial Safira", search);
    expect(result.kind).toBe("none");
  });
});

describe("formatação de mensagens", () => {
  it("descreve o imóvel em múltiplas linhas", () => {
    const text = describeProperty(buriti);
    expect(text).toContain("Ref 123");
    expect(text).toContain("R$ 850.000");
    expect(text).toContain("3 quartos");
    expect(text).toContain("https://fqimoveis.com.br/imovel/123");
  });

  it("monta legenda compacta para a foto", () => {
    expect(propertyCaption(buriti)).toContain("Ref 123 • R$ 850.000 • Buriti");
  });
});

describe("generatePropertyFlyer", () => {
  it("gera um PDF válido sem fotos", async () => {
    const bytes = await generatePropertyFlyer({ ...buriti, payload: { description: "Apartamento amplo" } });
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf-8");
    expect(header).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
