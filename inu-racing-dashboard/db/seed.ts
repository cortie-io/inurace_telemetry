import "./load-env";
import { randomBytes } from "node:crypto";
import { hash } from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { db, client } from "./index";
import { devices, users } from "./schema";

function generatePassword(): string {
  return randomBytes(12).toString("base64url"); // 16 chars, url-safe
}

function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

async function main() {
  const existingAdmin = await db.query.users.findFirst({ where: eq(users.username, "admin") });
  if (existingAdmin) {
    console.log("Admin user 'admin' already exists — skipping user seed (unchanged).");
  } else {
    const password = generatePassword();
    const passwordHash = await hash(password, 12);
    await db.insert(users).values({
      username: "admin",
      passwordHash,
      displayName: "Crew Admin",
      role: "crew",
    });
    console.log("\n=== Seeded dashboard login (save this now, shown once) ===");
    console.log(`  username: admin`);
    console.log(`  password: ${password}`);
    console.log("=============================================================\n");
  }

  const existingDevice = await db.query.devices.findFirst({
    where: eq(devices.deviceKey, "esp32-01"),
  });
  if (existingDevice) {
    console.log("Device 'esp32-01' already exists — skipping device seed (unchanged).");
  } else {
    const token = generateDeviceToken();
    const tokenHash = await hash(token, 12);
    await db.insert(devices).values({
      deviceKey: "esp32-01",
      tokenHash,
      label: "INU Racing Car — primary telemetry unit",
    });
    console.log("=== Seeded device credentials (save this now, shown once) ===");
    console.log(`  deviceKey: esp32-01`);
    console.log(`  token:     ${token}`);
    console.log("  -> goes into esp32-client.ino's DEVICE_TOKEN, and DEVICE_TOKEN env for the simulator");
    console.log("================================================================\n");
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
