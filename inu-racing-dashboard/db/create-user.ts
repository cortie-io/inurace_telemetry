import "./load-env";
import { hash } from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { client, db } from "./index";
import { users } from "./schema";

async function main() {
  const [username, password, displayName] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: tsx db/create-user.ts <username> <password> [displayName]");
    process.exit(1);
  }

  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
    console.log(`User '${username}' already exists — not modified.`);
  } else {
    const passwordHash = await hash(password, 12);
    await db.insert(users).values({
      username,
      passwordHash,
      displayName: displayName ?? username,
      role: "crew",
    });
    console.log(`Created crew login: ${username}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
