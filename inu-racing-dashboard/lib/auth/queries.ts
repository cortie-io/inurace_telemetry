import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function getUserByUsername(username: string) {
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  return user ?? null;
}
