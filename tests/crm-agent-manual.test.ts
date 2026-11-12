import { readFileSync, appendFileSync } from "node:fs";
import { describe, it } from "vitest";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch { /* ignore */ }
}

const q = process.env.CRM_TEST_Q ?? "quantos novos negocios foram incluidos em novembro?";

describe.skipIf(!process.env.B24_WEBHOOK_URL)("manual", () => {
  it(q, async () => {
    const { answerWithBitrixTools } = await import("../lib/bitrix-agent");
    const r = await answerWithBitrixTools(q, { name: "Tiago Maron", bitrixId: "30" } as never);
    appendFileSync("crm-test-replies.txt", `Q: ${q}\nREPLY: ${r}\n---\n`);
  }, 120_000);
});
