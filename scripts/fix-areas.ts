import "dotenv/config";
import { adminDb } from "../lib/supabase";

async function main() {
  const db = adminDb();
  const { error } = await db.from("properties").update({ area: null }).eq("area", 0);
  if (error) { console.error("Erro:", error); process.exit(1); }
  console.log("Áreas 0 atualizadas para null");
}

main();
