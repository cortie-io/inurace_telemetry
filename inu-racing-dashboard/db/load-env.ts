import fs from "node:fs";
import path from "node:path";

// Next.js itself auto-loads .env.local at runtime, but standalone scripts run via tsx
// (drizzle-kit config, migrate, seed) are outside that runtime and need it loaded manually.
for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
