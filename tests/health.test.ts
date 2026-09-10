import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

describe("health endpoint", () => {
  it("reports the service as healthy", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "fq-imoveis-agent" });
  });
});
