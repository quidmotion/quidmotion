import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim();
    }
  }
}
process.env.DB_PROVIDER = "local";

const { createLocalAdapter } = await import("../lib/db/adapters/local.ts");
const { schema } = await import("../lib/db/schema/index.ts");
const { eq } = await import("drizzle-orm");
const { verifyPassword } = await import("../lib/crypto/password.ts");
const { mintSealedCookie } = await import("../lib/auth/sealed.ts");

const adapter = createLocalAdapter();
const db = adapter.db;

const user = db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, "investor@quidmotion.com"))
  .get();

console.log("user:", user ? { email: user.email, name: user.name, role: user.role } : null);
if (!user) process.exit(1);

const t0 = Date.now();
const ok = verifyPassword("password123", user.passwordHash);
console.log("password123 ok:", ok, "ms:", Date.now() - t0);

const t1 = Date.now();
const seal = await mintSealedCookie({
  sub: user.id,
  role: user.role,
  sid: "test-sid",
  expiresAt: new Date(Date.now() + 86400000),
});
console.log("seal minted, length:", seal.length, "ms:", Date.now() - t1);
console.log("seal parts:", seal.split(".").length);

await adapter.close();
console.log("done");
